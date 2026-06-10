#include "SculptEngine.hpp"
#include <algorithm>
#include <cmath>

namespace {
float moveFalloff(float distance, float radius) {
  const float t = std::clamp(1.0f - distance / radius, 0.0f, 1.0f);
  return t * t * (3.0f - 2.0f * t);
}
}

SculptEngine::SculptEngine() { createQuadSphere(1.0f, 5); }
void SculptEngine::createQuadSphere(float radius, int level) { mesh_ = PrimitiveGenerator::quadSphere(radius, level); coarseLevels_.clear(); moveGrabbed_.clear(); }
void SculptEngine::subdivideCurrent() { coarseLevels_.push_back(mesh_); PrimitiveGenerator::subdivideCurrent(mesh_); }
bool SculptEngine::restoreCoarseLevel() {
  if (coarseLevels_.empty()) return false;
  mesh_ = std::move(coarseLevels_.back());
  coarseLevels_.pop_back();
  return true;
}
bool SculptEngine::applyDraw(float x,float y,float z,float radius,float strength,bool invert) {
  return Brush::draw(mesh_, {x,y,z}, {radius,strength,invert});
}
bool SculptEngine::applySmooth(float x,float y,float z,float radius,float strength) {
  return Brush::smooth(mesh_, {x,y,z}, {radius,strength,false});
}
bool SculptEngine::applyClay(float x,float y,float z,float nx,float ny,float nz,float radius,float strength,bool invert) {
  return Brush::clay(mesh_, {x,y,z}, {nx,ny,nz}, {radius,strength,invert});
}
void SculptEngine::beginMove(float x,float y,float z,float radius) {
  const Vec3 center{x,y,z};
  const float radius_squared = radius * radius;
  moveGrabbed_.clear();
  for (std::size_t i = 0; i < mesh_.vertices.size(); ++i) {
    const Vec3 offset = mesh_.vertices[i] - center;
    const float distance_squared = offset.lengthSquared();
    if (distance_squared > radius_squared) continue;
    moveGrabbed_.push_back({
      static_cast<std::uint32_t>(i),
      moveFalloff(std::sqrt(distance_squared), radius),
      mesh_.vertices[i],
    });
  }
}
bool SculptEngine::applyMove(float dx,float dy,float dz,bool invert) {
  if (moveGrabbed_.empty()) return false;
  const float direction = invert ? -1.0f : 1.0f;
  const Vec3 delta{dx * direction, dy * direction, dz * direction};
  for (const auto& vertex : moveGrabbed_) {
    mesh_.vertices[vertex.index] = vertex.base + delta * vertex.weight;
  }
  mesh_.rebuildDerivedData();
  return true;
}
bool SculptEngine::pixRemesh(const std::vector<float>& positions,
                             const std::vector<std::uint32_t>& indices,
                             int resolution,
                             float adaptiveDensity,
                             bool preserveSharpFeatures,
                             int smoothIterations,
                             bool projectDetails) {
  if (positions.size() < 9 || indices.size() < 3) return false;
  Mesh source;
  source.vertices.reserve(positions.size() / 3);
  for (std::size_t index = 0; index + 2 < positions.size(); index += 3) {
    source.vertices.push_back({positions[index], positions[index + 1], positions[index + 2]});
  }
  for (std::size_t index = 0; index + 2 < indices.size(); index += 3) {
    if (indices[index] >= source.vertices.size() ||
        indices[index + 1] >= source.vertices.size() ||
        indices[index + 2] >= source.vertices.size()) {
      continue;
    }
    source.triangles.push_back({indices[index], indices[index + 1], indices[index + 2]});
  }
  source.rebuildDerivedData();

  PixRemeshOptions options;
  options.resolution = resolution;
  options.adaptiveDensity = adaptiveDensity;
  options.preserveSharpFeatures = preserveSharpFeatures;
  options.smoothIterations = smoothIterations;
  options.projectDetails = projectDetails;

  PixRemesh remesher;
  Mesh result = remesher.remesh(source, options);
  if (result.vertices.empty() || result.indices.size() < 12 || result.vertices.size() > result.indices.size()) return false;
  history_.push(mesh_);
  mesh_ = std::move(result);
  coarseLevels_.clear();
  moveGrabbed_.clear();
  return true;
}
std::uint32_t SculptEngine::previewPixRemeshTriangles(const std::vector<float>& positions,
                                                      const std::vector<std::uint32_t>& indices,
                                                      int resolution,
                                                      float adaptiveDensity,
                                                      bool preserveSharpFeatures,
                                                      int smoothIterations,
                                                      bool projectDetails) {
  if (positions.size() < 9 || indices.size() < 3) return 0;
  Mesh source;
  source.vertices.reserve(positions.size() / 3);
  for (std::size_t index = 0; index + 2 < positions.size(); index += 3) {
    source.vertices.push_back({positions[index], positions[index + 1], positions[index + 2]});
  }
  for (std::size_t index = 0; index + 2 < indices.size(); index += 3) {
    if (indices[index] >= source.vertices.size() ||
        indices[index + 1] >= source.vertices.size() ||
        indices[index + 2] >= source.vertices.size()) {
      continue;
    }
    source.triangles.push_back({indices[index], indices[index + 1], indices[index + 2]});
  }
  source.rebuildDerivedData();
  PixRemeshOptions options;
  options.resolution = resolution;
  options.adaptiveDensity = adaptiveDensity;
  options.preserveSharpFeatures = preserveSharpFeatures;
  options.smoothIterations = smoothIterations;
  options.projectDetails = projectDetails;
  const auto stats = PixRemesh{}.preview(source, options);
  return stats.vertices > stats.triangles * 3 || stats.triangles < 4 ? 0 : stats.triangles;
}
void SculptEngine::beginStroke() { history_.push(mesh_); }
bool SculptEngine::undo() { return history_.undo(mesh_); }
bool SculptEngine::redo() { return history_.redo(mesh_); }
