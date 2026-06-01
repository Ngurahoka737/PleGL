#pragma once
#include "Math.hpp"
#include <array>
#include <cstdint>
#include <vector>

using Quad = std::array<std::uint32_t, 4>;

class Mesh {
 public:
  std::vector<Vec3> vertices;
  std::vector<Vec3> normals;
  std::vector<Quad> quads;
  std::vector<std::uint32_t> indices;
  std::vector<std::vector<std::uint32_t>> neighbors;

  void rebuildDerivedData();
  std::vector<float> packedPositions() const;
  std::vector<float> packedNormals() const;
};
