#include "Brush.hpp"
#include <algorithm>
#include <vector>

namespace {
float falloff(float distance, float radius) {
  const float t = std::clamp(1.0f - distance / radius, 0.0f, 1.0f);
  return t * t * (3.0f - 2.0f * t);
}

std::vector<float> smoothIterationStrengths(float strength) {
  constexpr int max_iterations = 4;
  const float clamped = std::clamp(strength, 0.0f, 1.0f);
  const int full_iterations = static_cast<int>(clamped * max_iterations);
  const float last = max_iterations * (clamped - static_cast<float>(full_iterations) / max_iterations);
  std::vector<float> result(full_iterations, 1.0f);
  if (last > 0.0f) result.push_back(last);
  return result;
}
}

bool Brush::draw(Mesh& mesh, const Vec3& center, const BrushSettings& settings) {
  bool changed = false;
  const float direction = settings.invert ? -1.0f : 1.0f;
  const float radius_squared = settings.radius * settings.radius;
  for (std::size_t i = 0; i < mesh.vertices.size(); ++i) {
    const Vec3 offset = mesh.vertices[i] - center;
    const float distance_squared = offset.lengthSquared();
    if (distance_squared > radius_squared) continue;
    const float distance = std::sqrt(distance_squared);
    mesh.vertices[i] += mesh.normals[i] * (direction * settings.strength * falloff(distance, settings.radius));
    changed = true;
  }
  if (changed) mesh.rebuildDerivedData();
  return changed;
}

bool Brush::smooth(Mesh& mesh, const Vec3& center, const BrushSettings& settings) {
  bool changed = false;
  const float radius_squared = settings.radius * settings.radius;
  for (const float strength : smoothIterationStrengths(settings.strength * 5.0f)) {
    auto next = mesh.vertices;
    bool iteration_changed = false;
    for (std::size_t i = 0; i < mesh.vertices.size(); ++i) {
      const Vec3 offset = mesh.vertices[i] - center;
      const float distance_squared = offset.lengthSquared();
      if (distance_squared > radius_squared || mesh.neighbors[i].empty()) continue;
      const float distance = std::sqrt(distance_squared);
      Vec3 average{};
      for (const auto neighbor : mesh.neighbors[i]) average += mesh.vertices[neighbor];
      average = average * (1.0f / static_cast<float>(mesh.neighbors[i].size()));
      const float factor = std::clamp(strength * falloff(distance, settings.radius), 0.0f, 1.0f);
      if (factor <= 0.0f) continue;
      next[i] = mesh.vertices[i] + (average - mesh.vertices[i]) * factor;
      iteration_changed = true;
    }
    if (!iteration_changed) continue;
    mesh.vertices = std::move(next);
    changed = true;
  }
  if (changed) mesh.rebuildDerivedData();
  return changed;
}

bool Brush::clay(Mesh& mesh, const Vec3& center, const Vec3& planeNormal, const BrushSettings& settings) {
  const Vec3 normal = planeNormal.normalized();
  const float direction = settings.invert ? -1.0f : 1.0f;
  const Vec3 planePoint = center + normal * (direction * settings.radius * 0.08f);
  const float radius_squared = settings.radius * settings.radius;
  bool changed = false;

  for (auto& vertex : mesh.vertices) {
    const Vec3 offset = vertex - center;
    const float distance_squared = offset.lengthSquared();
    if (distance_squared > radius_squared) continue;
    const float distance = std::sqrt(distance_squared);
    const float signedDistance = (vertex - planePoint).dot(normal);
    const float translation = -signedDistance * settings.strength * 12.0f * falloff(distance, settings.radius);
    vertex += normal * translation;
    changed = true;
  }
  if (changed) mesh.rebuildDerivedData();
  return changed;
}
