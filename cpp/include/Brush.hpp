#pragma once
#include "Mesh.hpp"

struct BrushSettings {
  float radius = 0.24f;
  float strength = 0.012f;
  bool invert = false;
};

class Brush {
 public:
  static bool draw(Mesh& mesh, const Vec3& center, const BrushSettings& settings);
  static bool smooth(Mesh& mesh, const Vec3& center, const BrushSettings& settings);
  static bool clay(Mesh& mesh, const Vec3& center, const Vec3& planeNormal, const BrushSettings& settings);
};
