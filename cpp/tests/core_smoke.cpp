#include "Brush.hpp"
#include "PrimitiveGenerator.hpp"
#include "SculptEngine.hpp"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <map>
#include <utility>

Mesh createBoxGeometryStyleCube(float size) {
  const float h = size * 0.5f;
  Mesh mesh;
  mesh.vertices = {
    {-h,-h,h},{h,-h,h},{h,h,h},{-h,h,h},
    {h,-h,-h},{-h,-h,-h},{-h,h,-h},{h,h,-h},
    {-h,h,h},{h,h,h},{h,h,-h},{-h,h,-h},
    {-h,-h,-h},{h,-h,-h},{h,-h,h},{-h,-h,h},
    {h,-h,h},{h,-h,-h},{h,h,-h},{h,h,h},
    {-h,-h,-h},{-h,-h,h},{-h,h,h},{-h,h,-h},
  };
  mesh.triangles = {
    {0,1,2},{0,2,3},
    {4,5,6},{4,6,7},
    {8,9,10},{8,10,11},
    {12,13,14},{12,14,15},
    {16,17,18},{16,18,19},
    {20,21,22},{20,22,23},
  };
  mesh.rebuildDerivedData();
  return mesh;
}

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

bool hasMostlyOutwardTriangles(const Mesh& mesh, float requiredRatio = 0.95f) {
  int outward = 0;
  int tested = 0;
  for (const auto& triangle : mesh.triangles) {
    if (triangle[0] >= mesh.vertices.size() || triangle[1] >= mesh.vertices.size() || triangle[2] >= mesh.vertices.size()) continue;
    const Vec3 a = mesh.vertices[triangle[0]];
    const Vec3 b = mesh.vertices[triangle[1]];
    const Vec3 c = mesh.vertices[triangle[2]];
    const Vec3 normal{
      (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
      (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
    };
    const Vec3 centroid = (a + b + c) * (1.0f / 3.0f);
    if (normal.dot(centroid) > 0.0f) ++outward;
    ++tested;
  }
  return tested > 0 && static_cast<float>(outward) / static_cast<float>(tested) >= requiredRatio;
}

bool hasReasonableEdgeDistribution(const Mesh& mesh, float maxRatio = 5.0f) {
  float total = 0.0f;
  float longest = 0.0f;
  int count = 0;
  for (std::size_t index = 0; index + 2 < mesh.indices.size(); index += 3) {
    const std::uint32_t triangle[3] = {mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]};
    for (int edge = 0; edge < 3; ++edge) {
      if (triangle[edge] >= mesh.vertices.size() || triangle[(edge + 1) % 3] >= mesh.vertices.size()) continue;
      const float length = (mesh.vertices[triangle[edge]] - mesh.vertices[triangle[(edge + 1) % 3]]).length();
      total += length;
      longest = std::max(longest, length);
      ++count;
    }
  }
  if (count == 0) return false;
  const float average = total / static_cast<float>(count);
  return average > 0.0f && longest / average <= maxRatio;
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
  engine.beginMove(0, 0, 1, 0.3f);
  if (!engine.applyMove(0.1f, 0.0f, 0.0f, false)) return 8;
  engine.subdivideCurrent();
  if (!engine.restoreCoarseLevel()) return 9;
  const Mesh remeshSource = PrimitiveGenerator::quadSphere(1.0f, 2);
  if (!engine.pixRemesh(remeshSource.packedPositions(), remeshSource.indices, 18, 0.0f, false, 1, true)) return 10;
  if (engine.mesh().vertices.empty() || engine.mesh().indices.empty()) return 11;
  const Mesh cubeSource = createBoxGeometryStyleCube(0.9f);
  if (!engine.pixRemesh(cubeSource.packedPositions(), cubeSource.indices, 56, 0.5f, false, 4, true)) return 12;
  if (engine.mesh().quads.empty()) {
    std::cerr << "PixRemesh cube did not preserve quad-dominant topology\n";
    return 13;
  }
  if (engine.mesh().indices.size() / 3 < 256) {
    std::cerr << "PixRemesh cube produced too few triangles: " << engine.mesh().indices.size() / 3
              << " vertices=" << engine.mesh().vertices.size() << "\n";
    return 14;
  }
  if (engine.mesh().vertices.size() > engine.mesh().indices.size()) {
    std::cerr << "PixRemesh cube left excessive unused vertices: " << engine.mesh().vertices.size()
              << " indices=" << engine.mesh().indices.size() << "\n";
    return 15;
  }
  if (!hasMostlyOutwardTriangles(engine.mesh())) {
    std::cerr << "PixRemesh cube produced inconsistent triangle winding\n";
    return 16;
  }
  if (!hasReasonableEdgeDistribution(engine.mesh())) {
    std::cerr << "PixRemesh cube produced uneven edge distribution\n";
    return 17;
  }
  std::cout << "vertices=" << mesh.vertices.size()
            << " triangles=" << mesh.indices.size() / 3
            << " manifold=true brushes=draw,smooth,clay,move pixremesh=true divide=true restoreCoarse=true\n";
  return 0;
}
