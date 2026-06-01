#pragma once
#include "Mesh.hpp"
#include <vector>

class HistoryManager {
 public:
  void push(const Mesh& mesh);
  bool undo(Mesh& mesh);
  bool redo(Mesh& mesh);

 private:
  std::vector<std::vector<Vec3>> undoStack_;
  std::vector<std::vector<Vec3>> redoStack_;
};
