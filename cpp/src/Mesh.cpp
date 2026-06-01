#include "Mesh.hpp"
#include <algorithm>

void Mesh::rebuildDerivedData() {
  indices.clear();
  normals.assign(vertices.size(), {});
  neighbors.assign(vertices.size(), {});
  for (const auto& q : quads) {
    indices.insert(indices.end(), {q[0], q[1], q[2], q[0], q[2], q[3]});
    for (int i = 0; i < 4; ++i) {
      const auto a = q[i], b = q[(i + 1) % 4];
      neighbors[a].push_back(b);
      neighbors[b].push_back(a);
    }
  }
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
