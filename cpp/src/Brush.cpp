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
  for (std::size_t i = 0; i < mesh.vertices.size(); ++i) {
    const float distance = (mesh.vertices[i] - center).length();
    if (distance > settings.radius) continue;
    mesh.vertices[i] += mesh.normals[i] * (direction * settings.strength * falloff(distance, settings.radius));
    changed = true;
  }
  if (changed) mesh.rebuildDerivedData();
  return changed;
}

bool Brush::smooth(Mesh& mesh, const Vec3& center, const BrushSettings& settings) {
  auto next = mesh.vertices;
  bool changed = false;
  for (std::size_t i = 0; i < mesh.vertices.size(); ++i) {
    const float distance = (mesh.vertices[i] - center).length();
    if (distance > settings.radius || mesh.neighbors[i].empty()) continue;
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
  bool changed = false;

  for (auto& vertex : mesh.vertices) {
    const float distance = (vertex - center).length();
    if (distance > settings.radius) continue;
    const float signedDistance = (vertex - planePoint).dot(normal);
    const float translation = -signedDistance * settings.strength * 12.0f * falloff(distance, settings.radius);
    vertex += normal * translation;
    changed = true;
  }
  if (changed) mesh.rebuildDerivedData();
  return changed;
}
