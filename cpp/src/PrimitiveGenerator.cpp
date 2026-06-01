#include "PrimitiveGenerator.hpp"
#include <map>

namespace {
using Edge = std::pair<std::uint32_t, std::uint32_t>;
Edge edgeKey(std::uint32_t a, std::uint32_t b) { return a < b ? Edge{a, b} : Edge{b, a}; }

void subdivide(Mesh& mesh) {
  std::map<Edge, std::uint32_t> midpoints;
  std::vector<Vec3> vertices = mesh.vertices;
  std::vector<Quad> quads;
  auto addMidpoint = [&](std::uint32_t a, std::uint32_t b) {
    const auto key = edgeKey(a, b);
    if (midpoints.contains(key)) return midpoints[key];
    const auto index = static_cast<std::uint32_t>(vertices.size());
    vertices.push_back((mesh.vertices[a] + mesh.vertices[b]) * 0.5f);
    midpoints[key] = index;
    return index;
  };
  for (const auto& q : mesh.quads) {
    for (int edge = 0; edge < 4; ++edge) addMidpoint(q[edge], q[(edge + 1) % 4]);
  }
  std::vector<std::uint32_t> centers;
  for (const auto& q : mesh.quads) {
    centers.push_back(static_cast<std::uint32_t>(vertices.size()));
    vertices.push_back((mesh.vertices[q[0]] + mesh.vertices[q[1]] + mesh.vertices[q[2]] + mesh.vertices[q[3]]) * 0.25f);
  }
  for (std::size_t face = 0; face < mesh.quads.size(); ++face) {
    const auto& q = mesh.quads[face];
    const auto ab = midpoints[edgeKey(q[0], q[1])], bc = midpoints[edgeKey(q[1], q[2])];
    const auto cd = midpoints[edgeKey(q[2], q[3])], da = midpoints[edgeKey(q[3], q[0])];
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
