#include "Mesh.hpp"
#include <algorithm>
#include <map>

void Mesh::rebuildDerivedData() {
  const auto existingIndices = indices;
  indices.clear();
  normals.assign(vertices.size(), {});
  neighbors.assign(vertices.size(), {});
  auto addNeighbor = [&](std::uint32_t a, std::uint32_t b) {
    if (a >= neighbors.size() || b >= neighbors.size()) return;
    neighbors[a].push_back(b);
    neighbors[b].push_back(a);
  };

  if (!quads.empty()) {
    triangles.clear();
    for (const auto& q : quads) {
      indices.insert(indices.end(), {q[0], q[1], q[2], q[0], q[2], q[3]});
      triangles.push_back({q[0], q[1], q[2]});
      triangles.push_back({q[0], q[2], q[3]});
      for (int i = 0; i < 4; ++i) {
        const auto a = q[i], b = q[(i + 1) % 4];
        addNeighbor(a, b);
      }
    }
  } else {
    if (triangles.empty()) {
      for (std::size_t index = 0; index + 2 < existingIndices.size(); index += 3) {
        triangles.push_back({existingIndices[index], existingIndices[index + 1], existingIndices[index + 2]});
      }
    }
    for (const auto& triangle : triangles) {
      indices.insert(indices.end(), {triangle[0], triangle[1], triangle[2]});
      for (int i = 0; i < 3; ++i) {
        const auto a = triangle[i], b = triangle[(i + 1) % 3];
        addNeighbor(a, b);
      }
    }
  }

  for (std::size_t index = 0; index + 2 < indices.size(); index += 3) {
    const auto ia = indices[index], ib = indices[index + 1], ic = indices[index + 2];
    if (ia >= vertices.size() || ib >= vertices.size() || ic >= vertices.size()) continue;
    const auto a = vertices[ia];
    const auto b = vertices[ib];
    const auto c = vertices[ic];
    const Vec3 ab = b - a;
    const Vec3 ac = c - a;
    const Vec3 normal{
      ab.y * ac.z - ab.z * ac.y,
      ab.z * ac.x - ab.x * ac.z,
      ab.x * ac.y - ab.y * ac.x,
    };
    normals[ia] += normal;
    normals[ib] += normal;
    normals[ic] += normal;
  }

  if (!quads.empty()) {
    for (const auto& q : quads) {
      Vec3 normal{};
      for (int i = 0; i < 4; ++i) {
        const auto& a = vertices[q[i]];
        const auto& b = vertices[q[(i + 1) % 4]];
        normal.x += (a.y - b.y) * (a.z + b.z);
        normal.y += (a.z - b.z) * (a.x + b.x);
        normal.z += (a.x - b.x) * (a.y + b.y);
      }
      for (const auto vertex : q) normals[vertex] += normal;
    }
  }

  for (auto& normal : normals) normal = normal.normalized();
  for (auto& list : neighbors) {
    std::sort(list.begin(), list.end());
    list.erase(std::unique(list.begin(), list.end()), list.end());
  }
}

std::vector<float> Mesh::packedPositions() const {
  std::vector<float> result; result.reserve(vertices.size() * 3);
  for (const auto& v : vertices) result.insert(result.end(), {v.x, v.y, v.z});
  return result;
}

std::vector<float> Mesh::packedNormals() const {
  std::vector<float> result; result.reserve(normals.size() * 3);
  for (const auto& v : normals) result.insert(result.end(), {v.x, v.y, v.z});
  return result;
}

std::vector<std::uint32_t> Mesh::packedDisplayEdges() const {
  std::vector<std::uint32_t> result;
  std::map<std::pair<std::uint32_t, std::uint32_t>, bool> edges;
  auto addEdge = [&](std::uint32_t a, std::uint32_t b) {
    if (a > b) std::swap(a, b);
    edges[{a, b}] = true;
  };
  if (!quads.empty()) {
    for (const auto& quad : quads) {
      for (int index = 0; index < 4; ++index) addEdge(quad[index], quad[(index + 1) % 4]);
    }
  } else {
    for (const auto& triangle : triangles) {
      for (int index = 0; index < 3; ++index) addEdge(triangle[index], triangle[(index + 1) % 3]);
    }
  }
  result.reserve(edges.size() * 2);
  for (const auto& [edge, _] : edges) {
    result.push_back(edge.first);
    result.push_back(edge.second);
  }
  return result;
}

std::vector<std::uint32_t> Mesh::packedQuads() const {
  std::vector<std::uint32_t> result;
  result.reserve(quads.size() * 4);
  for (const auto& quad : quads) result.insert(result.end(), {quad[0], quad[1], quad[2], quad[3]});
  return result;
}
