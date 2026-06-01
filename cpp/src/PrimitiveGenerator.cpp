#include "PrimitiveGenerator.hpp"
#include <algorithm>
#include <map>

namespace {
using Edge = std::pair<std::uint32_t, std::uint32_t>;
Edge edgeKey(std::uint32_t a, std::uint32_t b) { return a < b ? Edge{a, b} : Edge{b, a}; }

void subdivide(Mesh& mesh) {
  struct EdgeData {
    std::uint32_t a;
    std::uint32_t b;
    std::vector<std::uint32_t> faces;
  };
  std::map<Edge, EdgeData> edges;
  std::vector<Edge> edge_order;
  std::vector<std::vector<std::uint32_t>> vertex_faces(mesh.vertices.size());
  std::vector<std::vector<Edge>> vertex_edges(mesh.vertices.size());
  std::vector<Vec3> face_points;
  std::vector<Quad> quads;
  for (std::size_t face = 0; face < mesh.quads.size(); ++face) {
    const auto& q = mesh.quads[face];
    face_points.push_back((mesh.vertices[q[0]] + mesh.vertices[q[1]] + mesh.vertices[q[2]] + mesh.vertices[q[3]]) * 0.25f);
    for (int index = 0; index < 4; ++index) {
      const auto a = q[index], b = q[(index + 1) % 4];
      const auto key = edgeKey(a, b);
      if (!edges.contains(key)) {
        edges[key] = {a, b, {}};
        edge_order.push_back(key);
      }
      edges[key].faces.push_back(static_cast<std::uint32_t>(face));
      vertex_faces[a].push_back(static_cast<std::uint32_t>(face));
      vertex_edges[a].push_back(key);
      vertex_edges[b].push_back(key);
    }
  }

  std::vector<Vec3> vertices;
  vertices.reserve(mesh.vertices.size() + edges.size() + mesh.quads.size());
  for (std::size_t vertex = 0; vertex < mesh.vertices.size(); ++vertex) {
    Vec3 face_average{};
    for (const auto face : vertex_faces[vertex]) face_average += face_points[face];
    face_average = face_average * (1.0f / static_cast<float>(vertex_faces[vertex].size()));
    Vec3 edge_average{};
    std::sort(vertex_edges[vertex].begin(), vertex_edges[vertex].end());
    vertex_edges[vertex].erase(std::unique(vertex_edges[vertex].begin(), vertex_edges[vertex].end()), vertex_edges[vertex].end());
    for (const auto& edge : vertex_edges[vertex]) edge_average += (mesh.vertices[edges[edge].a] + mesh.vertices[edges[edge].b]) * 0.5f;
    edge_average = edge_average * (1.0f / static_cast<float>(vertex_edges[vertex].size()));
    const float count = static_cast<float>(vertex_faces[vertex].size());
    vertices.push_back((face_average + edge_average * 2.0f + mesh.vertices[vertex] * (count - 3.0f)) * (1.0f / count));
  }

  std::map<Edge, std::uint32_t> edge_points;
  for (const auto& edge : edge_order) {
    const auto& record = edges[edge];
    Vec3 point = mesh.vertices[record.a] + mesh.vertices[record.b];
    for (const auto face : record.faces) point += face_points[face];
    edge_points[edge] = static_cast<std::uint32_t>(vertices.size());
    vertices.push_back(point * (1.0f / static_cast<float>(2 + record.faces.size())));
  }
  std::vector<std::uint32_t> centers;
  for (const auto& point : face_points) {
    centers.push_back(static_cast<std::uint32_t>(vertices.size()));
    vertices.push_back(point);
  }
  for (std::size_t face = 0; face < mesh.quads.size(); ++face) {
    const auto& q = mesh.quads[face];
    const auto ab = edge_points[edgeKey(q[0], q[1])], bc = edge_points[edgeKey(q[1], q[2])];
    const auto cd = edge_points[edgeKey(q[2], q[3])], da = edge_points[edgeKey(q[3], q[0])];
    const auto center = centers[face];
    quads.insert(quads.end(), {{q[0], ab, center, da}, {ab, q[1], bc, center},
                               {center, bc, q[2], cd}, {da, center, cd, q[3]}});
  }
  mesh.vertices = std::move(vertices);
  mesh.quads = std::move(quads);
}

void relax(Mesh& mesh, float radius) {
  mesh.rebuildDerivedData();
  for (auto& vertex : mesh.vertices) vertex = vertex.normalized() * radius;
  for (int iteration = 0; iteration < 32; ++iteration) {
    auto next = mesh.vertices;
    for (std::size_t i = 0; i < mesh.vertices.size(); ++i) {
      Vec3 average{};
      for (const auto neighbor : mesh.neighbors[i]) average += mesh.vertices[neighbor];
      average = average * (1.0f / static_cast<float>(mesh.neighbors[i].size()));
      next[i] = (mesh.vertices[i] * 0.5f + average * 0.5f).normalized() * radius;
    }
    mesh.vertices = std::move(next);
  }
}
}

Mesh PrimitiveGenerator::quadSphere(float radius, int subdivisionLevel) {
  Mesh mesh;
  mesh.vertices = {{-1,-1,-1},{1,-1,-1},{1,1,-1},{-1,1,-1},{-1,-1,1},{1,-1,1},{1,1,1},{-1,1,1}};
  mesh.quads = {{{0,3,2,1}},{{4,5,6,7}},{{0,4,7,3}},{{1,2,6,5}},{{0,1,5,4}},{{3,7,6,2}}};
  for (int level = 0; level < subdivisionLevel; ++level) subdivide(mesh);
  relax(mesh, radius);
  mesh.rebuildDerivedData();
  return mesh;
}

void PrimitiveGenerator::subdivideCurrent(Mesh& mesh) {
  subdivide(mesh);
  mesh.rebuildDerivedData();
}
