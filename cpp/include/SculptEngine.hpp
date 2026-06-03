#pragma once
#include "Brush.hpp"
#include "HistoryManager.hpp"
#include "PrimitiveGenerator.hpp"
#include <vector>

struct MoveGrabbedVertex {
  std::uint32_t index;
  float weight;
  Vec3 base;
};

class SculptEngine {
 public:
  SculptEngine();
  void createQuadSphere(float radius, int subdivisionLevel);
  void subdivideCurrent();
  bool restoreCoarseLevel();
  bool applyDraw(float x, float y, float z, float radius, float strength, bool invert);
  bool applySmooth(float x, float y, float z, float radius, float strength);
  bool applyClay(float x, float y, float z, float nx, float ny, float nz, float radius, float strength, bool invert);
  void beginMove(float x, float y, float z, float radius);
  bool applyMove(float dx, float dy, float dz, bool invert);
  void beginStroke();
  bool undo();
  bool redo();
  const Mesh& mesh() const { return mesh_; }

 private:
  Mesh mesh_;
  HistoryManager history_;
  std::vector<Mesh> coarseLevels_;
  std::vector<MoveGrabbedVertex> moveGrabbed_;
};
