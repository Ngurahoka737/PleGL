#pragma once
#include "Mesh.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
#include <vector>

struct PixRemeshOptions {
  int resolution = 48;
  float adaptiveDensity = 0.0f;
  bool preserveSharpFeatures = false;
  int smoothIterations = 2;
  bool projectDetails = true;
};

struct PixRemeshStats {
  std::uint32_t vertices = 0;
  std::uint32_t triangles = 0;
};

class VoxelGrid {
 public:
  void resize(int resolution, const Vec3& minBounds, const Vec3& maxBounds);
  int resolution() const { return resolution_; }
  int dimension() const { return dimension_; }
  float voxelSize() const { return voxelSize_; }
  const Vec3& origin() const { return origin_; }
  Vec3 position(int x, int y, int z) const;
  float value(int x, int y, int z) const;
  void setValue(int x, int y, int z, float value);
  std::size_t linearIndex(int x, int y, int z) const;

 private:
  int resolution_ = 0;
  int dimension_ = 0;
  float voxelSize_ = 1.0f;
  Vec3 origin_{};
  std::vector<float> values_;
};

class SignedDistanceField {
 public:
  VoxelGrid build(const Mesh& source, const PixRemeshOptions& options) const;

 private:
  using TriangleList = std::vector<Triangle>;
  std::vector<TriangleList> buildShellComponents(const Mesh& source) const;
  bool pointInsideShell(const Vec3& point, const TriangleList& shell, const Mesh& source) const;
  float signedDistanceAt(const Vec3& point, const Mesh& source, const std::vector<TriangleList>& shells) const;
};

class MarchingCubes {
 public:
  Mesh reconstruct(const VoxelGrid& grid) const;

 private:
  void polygonizeTetra(const std::array<Vec3, 4>& points, const std::array<float, 4>& values, Mesh& mesh) const;
  Vec3 interpolate(const Vec3& a, const Vec3& b, float va, float vb) const;
};

class MeshOptimizer {
 public:
  Mesh optimize(const Mesh& input, float weldEpsilon) const;
};

class MeshRelaxer {
 public:
  void relax(Mesh& mesh, int iterations, float amount = 0.35f) const;

 private:
  void tangentialPass(Mesh& mesh, float amount) const;
};

class MeshRegularizer {
 public:
  void regularize(Mesh& mesh, int iterations, float amount = 0.16f) const;

 private:
  void valencePass(Mesh& mesh, float amount) const;
  void edgeLengthPass(Mesh& mesh, float amount) const;
  void quadShapePass(Mesh& mesh, float amount) const;
};

class QuadFlowField {
 public:
  void align(Mesh& mesh, int iterations, float amount = 0.18f) const;

 private:
  struct Frame {
    Vec3 u;
    Vec3 v;
  };

  std::vector<Frame> buildFrames(const Mesh& mesh) const;
  void smoothFrames(const Mesh& mesh, std::vector<Frame>& frames, int iterations) const;
  void flowPass(Mesh& mesh, const std::vector<Frame>& frames, float amount) const;
};

class MeshProjector {
 public:
  void project(Mesh& remeshed, const Mesh& source, float maxDistance, float strength = 0.35f) const;
};

class PixRemesh {
 public:
  Mesh remesh(const Mesh& source, const PixRemeshOptions& options) const;
  PixRemeshStats preview(const Mesh& source, const PixRemeshOptions& options) const;

 private:
  SignedDistanceField sdf_;
  MarchingCubes reconstruction_;
  MeshOptimizer optimizer_;
  MeshRelaxer relaxer_;
  MeshRegularizer regularizer_;
  QuadFlowField flowField_;
  MeshProjector projector_;
};
