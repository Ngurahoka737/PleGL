#include "Brush.hpp"
#include <algorithm>

namespace {
float falloff(float distance, float radius) {
  const float t = std::clamp(1.0f - distance / radius, 0.0f, 1.0f);
  return t * t * (3.0f - 2.0f * t);
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
  auto next = mesh.vertices;
  bool changed = false;
  const float radius_squared = settings.radius * settings.radius;
  for (std::size_t i = 0; i < mesh.vertices.size(); ++i) {
    const Vec3 offset = mesh.vertices[i] - center;
    const float distance_squared = offset.lengthSquared();
    if (distance_squared > radius_squared || mesh.neighbors[i].empty()) continue;
    const float distance = std::sqrt(distance_squared);
    Vec3 average{};
    for (const auto neighbor : mesh.neighbors[i]) average += mesh.vertices[neighbor];
    average = average * (1.0f / static_cast<float>(mesh.neighbors[i].size()));
    const float influence = std::clamp(settings.strength * 5.0f * falloff(distance, settings.radius), 0.0f, 1.0f);
    next[i] = mesh.vertices[i] * (1.0f - influence) + average * influence;
    changed = true;
  }
  if (changed) { mesh.vertices = std::move(next); mesh.rebuildDerivedData(); }
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
