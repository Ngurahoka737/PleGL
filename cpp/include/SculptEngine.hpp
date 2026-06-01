#pragma once
#include "Brush.hpp"
#include "HistoryManager.hpp"
#include "PrimitiveGenerator.hpp"

class SculptEngine {
 public:
  SculptEngine();
  void createQuadSphere(float radius, int subdivisionLevel);
  bool applyDraw(float x, float y, float z, float radius, float strength, bool invert);
  bool applySmooth(float x, float y, float z, float radius, float strength);
  bool applyClay(float x, float y, float z, float nx, float ny, float nz, float radius, float strength, bool invert);
  void beginStroke();
  bool undo();
  bool redo();
  const Mesh& mesh() const { return mesh_; }

 private:
  Mesh mesh_;
  HistoryManager history_;
};
