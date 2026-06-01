#include "Brush.hpp"
#include "PrimitiveGenerator.hpp"
#include "SculptEngine.hpp"
#include <iostream>
#include <map>
#include <utility>

bool isClosedManifold(const Mesh& mesh) {
  std::map<std::pair<std::uint32_t, std::uint32_t>, int> edges;
  for (std::size_t index = 0; index < mesh.indices.size(); index += 3) {
    for (int edge = 0; edge < 3; ++edge) {
      auto a = mesh.indices[index + edge];
      auto b = mesh.indices[index + (edge + 1) % 3];
      if (a > b) std::swap(a, b);
      ++edges[{a, b}];
    }
  }
  for (const auto& [edge, count] : edges) {
    if (count != 2) {
      std::cerr << "Non-manifold triangle edge: " << edge.first << ":" << edge.second << "\n";
      return false;
    }
  }
  return true;
}

int main() {
  Mesh mesh = PrimitiveGenerator::quadSphere(1.0f, 5);
  if (!isClosedManifold(mesh)) return 1;
  BrushSettings settings{0.3f, 0.01f, false};
  if (!Brush::draw(mesh, {0, 0, 1}, settings)) return 2;
  if (!Brush::smooth(mesh, {0, 0, 1}, settings)) return 3;
  if (!Brush::clay(mesh, {0, 0, 1}, {0, 0, 1}, settings)) return 4;
  const auto verticesBeforeSubdivision = mesh.vertices.size();
  PrimitiveGenerator::subdivideCurrent(mesh);
  if (mesh.vertices.size() <= verticesBeforeSubdivision) return 5;
  if (!isClosedManifold(mesh)) return 6;
  SculptEngine engine;
  engine.applyDraw(0, 0, 1, 0.3f, 0.01f, false);
  engine.subdivideCurrent();
  if (!engine.restoreCoarseLevel()) return 7;
  std::cout << "vertices=" << mesh.vertices.size()
            << " triangles=" << mesh.indices.size() / 3
            << " manifold=true brushes=draw,smooth,clay divide=true restoreCoarse=true\n";
  return 0;
}
