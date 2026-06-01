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
  for (std::size_t i = 0; i < indices.size(); i += 3) {
    const auto a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const Vec3 ab = vertices[b] - vertices[a], ac = vertices[c] - vertices[a];
    const Vec3 n{ab.y * ac.z - ab.z * ac.y, ab.z * ac.x - ab.x * ac.z, ab.x * ac.y - ab.y * ac.x};
    normals[a] += n; normals[b] += n; normals[c] += n;
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
