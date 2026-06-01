#include "HistoryManager.hpp"

void HistoryManager::push(const Mesh& mesh) {
  undoStack_.push_back(mesh.vertices);
  if (undoStack_.size() > 20) undoStack_.erase(undoStack_.begin());
  redoStack_.clear();
}
bool HistoryManager::undo(Mesh& mesh) {
  if (undoStack_.empty()) return false;
  redoStack_.push_back(mesh.vertices); mesh.vertices = undoStack_.back(); undoStack_.pop_back(); mesh.rebuildDerivedData(); return true;
}
bool HistoryManager::redo(Mesh& mesh) {
  if (redoStack_.empty()) return false;
  undoStack_.push_back(mesh.vertices); mesh.vertices = redoStack_.back(); redoStack_.pop_back(); mesh.rebuildDerivedData(); return true;
}
