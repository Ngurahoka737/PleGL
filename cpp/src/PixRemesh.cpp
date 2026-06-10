#include "PixRemesh.hpp"
#include <algorithm>
#include <cmath>
#include <limits>
#include <map>
#include <queue>
#include <string>
#include <unordered_map>

namespace {
constexpr float kEpsilon = 1e-6f;
constexpr float kDegenerateTriangleAreaSquared = 1e-16f;

Vec3 cross(const Vec3& a, const Vec3& b) {
  return {
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  };
}

float clamp01(float value) {
  return std::clamp(value, 0.0f, 1.0f);
}

Vec3 removeNormalComponent(const Vec3& delta, const Vec3& normal) {
  return delta - normal * delta.dot(normal);
}

std::uint64_t edgeKey(std::uint32_t a, std::uint32_t b) {
  if (a > b) std::swap(a, b);
  return (static_cast<std::uint64_t>(a) << 32u) | static_cast<std::uint64_t>(b);
}

float pointSegmentDistanceSquared(const Vec3& point, const Vec3& a, const Vec3& b) {
  const Vec3 ab = b - a;
  const float denominator = ab.lengthSquared();
  if (denominator <= kEpsilon) return (point - a).lengthSquared();
  const float t = clamp01((point - a).dot(ab) / denominator);
  return (point - (a + ab * t)).lengthSquared();
}

float pointTriangleDistanceSquared(const Vec3& point, const Vec3& a, const Vec3& b, const Vec3& c) {
  const Vec3 ab = b - a;
  const Vec3 ac = c - a;
  const Vec3 normal = cross(ab, ac);
  const float normalLengthSquared = normal.lengthSquared();
  if (normalLengthSquared <= kEpsilon) {
    return std::min({
      pointSegmentDistanceSquared(point, a, b),
      pointSegmentDistanceSquared(point, b, c),
      pointSegmentDistanceSquared(point, c, a),
    });
  }

  const Vec3 ap = point - a;
  const Vec3 projected = point - normal * (ap.dot(normal) / normalLengthSquared);
  const Vec3 c0 = cross(b - a, projected - a);
  const Vec3 c1 = cross(c - b, projected - b);
  const Vec3 c2 = cross(a - c, projected - c);
  if (c0.dot(normal) >= -kEpsilon && c1.dot(normal) >= -kEpsilon && c2.dot(normal) >= -kEpsilon) {
    return (point - projected).lengthSquared();
  }

  return std::min({
    pointSegmentDistanceSquared(point, a, b),
    pointSegmentDistanceSquared(point, b, c),
    pointSegmentDistanceSquared(point, c, a),
  });
}

Vec3 closestPointOnTriangle(const Vec3& point, const Vec3& a, const Vec3& b, const Vec3& c) {
  const Vec3 ab = b - a;
  const Vec3 ac = c - a;
  const Vec3 ap = point - a;
  const float d1 = ab.dot(ap);
  const float d2 = ac.dot(ap);
  if (d1 <= 0.0f && d2 <= 0.0f) return a;

  const Vec3 bp = point - b;
  const float d3 = ab.dot(bp);
  const float d4 = ac.dot(bp);
  if (d3 >= 0.0f && d4 <= d3) return b;

  const float vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0f && d1 >= 0.0f && d3 <= 0.0f) {
    const float v = d1 / (d1 - d3);
    return a + ab * v;
  }

  const Vec3 cp = point - c;
  const float d5 = ab.dot(cp);
  const float d6 = ac.dot(cp);
  if (d6 >= 0.0f && d5 <= d6) return c;

  const float vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0f && d2 >= 0.0f && d6 <= 0.0f) {
    const float w = d2 / (d2 - d6);
    return a + ac * w;
  }

  const float va = d3 * d6 - d5 * d4;
  if (va <= 0.0f && (d4 - d3) >= 0.0f && (d5 - d6) >= 0.0f) {
    const float w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return b + (c - b) * w;
  }

  const float denominator = 1.0f / (va + vb + vc);
  const float v = vb * denominator;
  const float w = vc * denominator;
  return a + ab * v + ac * w;
}

bool rayTriangleHitDistance(const Vec3& origin, const Vec3& direction, const Vec3& a, const Vec3& b, const Vec3& c, float& hitDistance) {
  const Vec3 edge1 = b - a;
  const Vec3 edge2 = c - a;
  const Vec3 h = cross(direction, edge2);
  const float det = edge1.dot(h);
  if (std::abs(det) < kEpsilon) return false;
  const float invDet = 1.0f / det;
  const Vec3 s = origin - a;
  const float u = invDet * s.dot(h);
  if (u < 0.0f || u > 1.0f) return false;
  const Vec3 q = cross(s, edge1);
  const float v = invDet * direction.dot(q);
  if (v < 0.0f || u + v > 1.0f) return false;
  const float t = invDet * edge2.dot(q);
  if (t <= kEpsilon) return false;
  hitDistance = t;
  return true;
}

std::string vertexKey(const Vec3& v, float scale) {
  const auto x = static_cast<long long>(std::llround(v.x * scale));
  const auto y = static_cast<long long>(std::llround(v.y * scale));
  const auto z = static_cast<long long>(std::llround(v.z * scale));
  return std::to_string(x) + ":" + std::to_string(y) + ":" + std::to_string(z);
}

void addTriangle(Mesh& mesh, const Vec3& a, const Vec3& b, const Vec3& c, const Vec3& outward) {
  const Vec3 normal = cross(b - a, c - a);
  if (normal.lengthSquared() <= kDegenerateTriangleAreaSquared) return;
  const auto base = static_cast<std::uint32_t>(mesh.vertices.size());
  mesh.vertices.push_back(a);
  if (normal.dot(outward) >= 0.0f) {
    mesh.vertices.push_back(b);
    mesh.vertices.push_back(c);
  } else {
    mesh.vertices.push_back(c);
    mesh.vertices.push_back(b);
  }
  mesh.triangles.push_back({base, base + 1, base + 2});
}

void orientFacesAwayFromCenter(Mesh& mesh) {
  if (mesh.vertices.empty()) return;
  Vec3 center{};
  for (const auto& vertex : mesh.vertices) center += vertex;
  center = center * (1.0f / static_cast<float>(mesh.vertices.size()));

  for (auto& quad : mesh.quads) {
    if (quad[0] >= mesh.vertices.size() || quad[1] >= mesh.vertices.size() ||
        quad[2] >= mesh.vertices.size() || quad[3] >= mesh.vertices.size()) continue;
    const Vec3 a = mesh.vertices[quad[0]];
    const Vec3 b = mesh.vertices[quad[1]];
    const Vec3 c = mesh.vertices[quad[2]];
    const Vec3 d = mesh.vertices[quad[3]];
    const Vec3 normal = cross(b - a, c - a);
    const Vec3 centroid = (a + b + c + d) * 0.25f;
    if (normal.dot(centroid - center) < 0.0f) std::swap(quad[1], quad[3]);
  }

  for (auto& triangle : mesh.triangles) {
    if (triangle[0] >= mesh.vertices.size() || triangle[1] >= mesh.vertices.size() || triangle[2] >= mesh.vertices.size()) continue;
    const Vec3 a = mesh.vertices[triangle[0]];
    const Vec3 b = mesh.vertices[triangle[1]];
    const Vec3 c = mesh.vertices[triangle[2]];
    const Vec3 normal = cross(b - a, c - a);
    const Vec3 centroid = (a + b + c) * (1.0f / 3.0f);
    if (normal.dot(centroid - center) < 0.0f) std::swap(triangle[1], triangle[2]);
  }
}

struct CachedTriangle {
  Vec3 a;
  Vec3 b;
  Vec3 c;
  float minX = 0.0f;
  float maxX = 0.0f;
  float minY = 0.0f;
  float maxY = 0.0f;
  float minZ = 0.0f;
  float maxZ = 0.0f;
};

CachedTriangle makeCachedTriangle(const Vec3& a, const Vec3& b, const Vec3& c) {
  return {
    a,
    b,
    c,
    std::min({a.x, b.x, c.x}),
    std::max({a.x, b.x, c.x}),
    std::min({a.y, b.y, c.y}),
    std::max({a.y, b.y, c.y}),
    std::min({a.z, b.z, c.z}),
    std::max({a.z, b.z, c.z}),
  };
}

std::vector<CachedTriangle> buildTriangleCache(const Mesh& source) {
  std::vector<CachedTriangle> cache;
  cache.reserve(source.triangles.size());
  for (const auto& triangle : source.triangles) {
    if (triangle[0] >= source.vertices.size() || triangle[1] >= source.vertices.size() || triangle[2] >= source.vertices.size()) continue;
    cache.push_back(makeCachedTriangle(source.vertices[triangle[0]], source.vertices[triangle[1]], source.vertices[triangle[2]]));
  }
  return cache;
}

float bboxDistanceSquared(const Vec3& point, const CachedTriangle& triangle) {
  const float dx = point.x < triangle.minX ? triangle.minX - point.x : point.x > triangle.maxX ? point.x - triangle.maxX : 0.0f;
  const float dy = point.y < triangle.minY ? triangle.minY - point.y : point.y > triangle.maxY ? point.y - triangle.maxY : 0.0f;
  const float dz = point.z < triangle.minZ ? triangle.minZ - point.z : point.z > triangle.maxZ ? point.z - triangle.maxZ : 0.0f;
  return dx * dx + dy * dy + dz * dz;
}

bool rayCanHitPositiveX(const Vec3& point, const Vec3& a, const Vec3& b, const Vec3& c) {
  constexpr float slack = 1e-5f;
  const float maxX = std::max({a.x, b.x, c.x});
  if (maxX <= point.x + slack) return false;
  const float minY = std::min({a.y, b.y, c.y}) - slack;
  const float maxY = std::max({a.y, b.y, c.y}) + slack;
  if (point.y < minY || point.y > maxY) return false;
  const float minZ = std::min({a.z, b.z, c.z}) - slack;
  const float maxZ = std::max({a.z, b.z, c.z}) + slack;
  return point.z >= minZ && point.z <= maxZ;
}

bool pointInsideShellFast(const Vec3& point, const std::vector<Triangle>& shell, const Mesh& source) {
  const Vec3 direction{1.0f, 0.0f, 0.0f};
  std::vector<float> hits;
  hits.reserve(64);
  for (const auto& triangle : shell) {
    if (triangle[0] >= source.vertices.size() || triangle[1] >= source.vertices.size() || triangle[2] >= source.vertices.size()) continue;
    const Vec3& a = source.vertices[triangle[0]];
    const Vec3& b = source.vertices[triangle[1]];
    const Vec3& c = source.vertices[triangle[2]];
    if (!rayCanHitPositiveX(point, a, b, c)) continue;

    float hitDistance = 0.0f;
    if (rayTriangleHitDistance(point, direction, a, b, c, hitDistance)) hits.push_back(hitDistance);
  }
  std::sort(hits.begin(), hits.end());
  int uniqueHits = 0;
  float previous = -std::numeric_limits<float>::max();
  const float mergeDistance = 1e-4f;
  for (const float hit : hits) {
    if (std::abs(hit - previous) <= mergeDistance) continue;
    previous = hit;
    ++uniqueHits;
  }
  return (uniqueHits % 2) == 1;
}

float signedDistanceFastAt(
  const Vec3& point,
  const Mesh& source,
  const std::vector<std::vector<Triangle>>& shells,
  const std::vector<CachedTriangle>& triangles) {
  float minDistanceSquared = std::numeric_limits<float>::max();
  for (const auto& triangle : triangles) {
    if (bboxDistanceSquared(point, triangle) >= minDistanceSquared) continue;
    minDistanceSquared = std::min(minDistanceSquared, pointTriangleDistanceSquared(point, triangle.a, triangle.b, triangle.c));
  }

  bool inside = false;
  for (const auto& shell : shells) {
    if (pointInsideShellFast(point, shell, source)) {
      inside = true;
      break;
    }
  }
  const float distance = std::sqrt(std::max(minDistanceSquared, 0.0f));
  return inside ? -distance : distance;
}
}

void VoxelGrid::resize(int resolution, const Vec3& minBounds, const Vec3& maxBounds) {
  resolution_ = std::clamp(resolution, 8, 160);
  dimension_ = resolution_ + 1;
  const Vec3 size = maxBounds - minBounds;
  const float maxExtent = std::max({size.x, size.y, size.z, 0.001f});
  voxelSize_ = maxExtent / static_cast<float>(resolution_);
  const Vec3 center = (minBounds + maxBounds) * 0.5f;
  const float halfSize = maxExtent * 0.5f + voxelSize_ * 2.0f;
  origin_ = center - Vec3{halfSize, halfSize, halfSize};
  voxelSize_ = (halfSize * 2.0f) / static_cast<float>(resolution_);
  values_.assign(static_cast<std::size_t>(dimension_) * dimension_ * dimension_, voxelSize_);
}

Vec3 VoxelGrid::position(int x, int y, int z) const {
  return origin_ + Vec3{
    static_cast<float>(x) * voxelSize_,
    static_cast<float>(y) * voxelSize_,
    static_cast<float>(z) * voxelSize_,
  };
}

float VoxelGrid::value(int x, int y, int z) const {
  return values_[linearIndex(x, y, z)];
}

void VoxelGrid::setValue(int x, int y, int z, float value) {
  values_[linearIndex(x, y, z)] = value;
}

std::size_t VoxelGrid::linearIndex(int x, int y, int z) const {
  return static_cast<std::size_t>(x + dimension_ * (y + dimension_ * z));
}

VoxelGrid SignedDistanceField::build(const Mesh& source, const PixRemeshOptions& options) const {
  Vec3 minBounds{
    std::numeric_limits<float>::max(),
    std::numeric_limits<float>::max(),
    std::numeric_limits<float>::max(),
  };
  Vec3 maxBounds{
    -std::numeric_limits<float>::max(),
    -std::numeric_limits<float>::max(),
    -std::numeric_limits<float>::max(),
  };
  for (const auto& vertex : source.vertices) {
    minBounds.x = std::min(minBounds.x, vertex.x);
    minBounds.y = std::min(minBounds.y, vertex.y);
    minBounds.z = std::min(minBounds.z, vertex.z);
    maxBounds.x = std::max(maxBounds.x, vertex.x);
    maxBounds.y = std::max(maxBounds.y, vertex.y);
    maxBounds.z = std::max(maxBounds.z, vertex.z);
  }

  VoxelGrid grid;
  grid.resize(options.resolution, minBounds, maxBounds);
  const auto shells = buildShellComponents(source);
  const auto triangles = buildTriangleCache(source);
  for (int z = 0; z < grid.dimension(); ++z) {
    for (int y = 0; y < grid.dimension(); ++y) {
      for (int x = 0; x < grid.dimension(); ++x) {
        grid.setValue(x, y, z, signedDistanceFastAt(grid.position(x, y, z), source, shells, triangles));
      }
    }
  }
  return grid;
}

std::vector<SignedDistanceField::TriangleList> SignedDistanceField::buildShellComponents(const Mesh& source) const {
  std::vector<Triangle> fallback;
  if (source.triangles.empty()) {
    for (std::size_t index = 0; index + 2 < source.indices.size(); index += 3) {
      fallback.push_back({source.indices[index], source.indices[index + 1], source.indices[index + 2]});
    }
  }
  const auto& tris = source.triangles.empty() ? fallback : source.triangles;
  std::unordered_map<std::string, std::vector<std::size_t>> vertexToTriangles;
  vertexToTriangles.reserve(tris.size() * 3);
  constexpr float weldScale = 100000.0f;
  for (std::size_t triangleIndex = 0; triangleIndex < tris.size(); ++triangleIndex) {
    for (const auto vertexIndex : tris[triangleIndex]) {
      if (vertexIndex >= source.vertices.size()) continue;
      vertexToTriangles[vertexKey(source.vertices[vertexIndex], weldScale)].push_back(triangleIndex);
    }
  }

  std::vector<std::uint8_t> visited(tris.size(), 0);
  std::vector<TriangleList> components;
  for (std::size_t start = 0; start < tris.size(); ++start) {
    if (visited[start]) continue;
    TriangleList component;
    std::queue<std::size_t> queue;
    queue.push(start);
    visited[start] = 1;
    while (!queue.empty()) {
      const auto current = queue.front();
      queue.pop();
      component.push_back(tris[current]);
      for (const auto vertexIndex : tris[current]) {
        if (vertexIndex >= source.vertices.size()) continue;
        const auto found = vertexToTriangles.find(vertexKey(source.vertices[vertexIndex], weldScale));
        if (found == vertexToTriangles.end()) continue;
        for (const auto next : found->second) {
          if (visited[next]) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    components.push_back(std::move(component));
  }
  return components;
}

bool SignedDistanceField::pointInsideShell(const Vec3& point, const TriangleList& shell, const Mesh& source) const {
  const Vec3 direction = Vec3{1.0f, 0.371f, 0.239f}.normalized();
  std::vector<float> hits;
  hits.reserve(shell.size() / 4);
  for (const auto& triangle : shell) {
    if (triangle[0] >= source.vertices.size() || triangle[1] >= source.vertices.size() || triangle[2] >= source.vertices.size()) continue;
    float hitDistance = 0.0f;
    if (rayTriangleHitDistance(point, direction, source.vertices[triangle[0]], source.vertices[triangle[1]], source.vertices[triangle[2]], hitDistance)) {
      hits.push_back(hitDistance);
    }
  }
  std::sort(hits.begin(), hits.end());
  int uniqueHits = 0;
  float previous = -std::numeric_limits<float>::max();
  const float mergeDistance = 1e-4f;
  for (const float hit : hits) {
    if (std::abs(hit - previous) <= mergeDistance) continue;
    previous = hit;
    ++uniqueHits;
  }
  return (uniqueHits % 2) == 1;
}

float SignedDistanceField::signedDistanceAt(const Vec3& point, const Mesh& source, const std::vector<TriangleList>& shells) const {
  float minDistanceSquared = std::numeric_limits<float>::max();
  for (const auto& triangle : source.triangles) {
    if (triangle[0] >= source.vertices.size() || triangle[1] >= source.vertices.size() || triangle[2] >= source.vertices.size()) continue;
    minDistanceSquared = std::min(minDistanceSquared, pointTriangleDistanceSquared(
      point,
      source.vertices[triangle[0]],
      source.vertices[triangle[1]],
      source.vertices[triangle[2]]));
  }
  bool inside = false;
  for (const auto& shell : shells) {
    if (pointInsideShell(point, shell, source)) {
      inside = true;
      break;
    }
  }
  const float distance = std::sqrt(std::max(minDistanceSquared, 0.0f));
  return inside ? -distance : distance;
}

Mesh MarchingCubes::reconstruct(const VoxelGrid& grid) const {
  Mesh mesh;
  constexpr int cornerOffset[8][3] = {
    {0, 0, 0}, {1, 0, 0}, {1, 1, 0}, {0, 1, 0},
    {0, 0, 1}, {1, 0, 1}, {1, 1, 1}, {0, 1, 1},
  };
  constexpr int cubeEdges[12][2] = {
    {0, 1}, {1, 2}, {2, 3}, {3, 0},
    {4, 5}, {5, 6}, {6, 7}, {7, 4},
    {0, 4}, {1, 5}, {2, 6}, {3, 7},
  };
  const int resolution = grid.resolution();
  const auto cellIndex = [resolution](int x, int y, int z) {
    return x + resolution * (y + resolution * z);
  };
  std::vector<int> cellVertices(static_cast<std::size_t>(resolution) * resolution * resolution, -1);

  for (int z = 0; z < resolution; ++z) {
    for (int y = 0; y < resolution; ++y) {
      for (int x = 0; x < resolution; ++x) {
        std::array<Vec3, 8> points{};
        std::array<float, 8> values{};
        bool hasInside = false;
        bool hasOutside = false;
        for (int corner = 0; corner < 8; ++corner) {
          const int sx = x + cornerOffset[corner][0];
          const int sy = y + cornerOffset[corner][1];
          const int sz = z + cornerOffset[corner][2];
          points[corner] = grid.position(sx, sy, sz);
          values[corner] = grid.value(sx, sy, sz);
          hasInside = hasInside || values[corner] < 0.0f;
          hasOutside = hasOutside || values[corner] >= 0.0f;
        }
        if (!hasInside || !hasOutside) continue;

        Vec3 vertex{};
        int crossings = 0;
        for (const auto& edge : cubeEdges) {
          const int a = edge[0];
          const int b = edge[1];
          if ((values[a] < 0.0f) == (values[b] < 0.0f)) continue;
          vertex += interpolate(points[a], points[b], values[a], values[b]);
          ++crossings;
        }
        if (crossings == 0) continue;
        vertex = vertex * (1.0f / static_cast<float>(crossings));
        cellVertices[cellIndex(x, y, z)] = static_cast<int>(mesh.vertices.size());
        mesh.vertices.push_back(vertex);
      }
    }
  }

  auto addQuad = [&](int a, int b, int c, int d, const Vec3& outward) {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const Vec3 normal = cross(mesh.vertices[b] - mesh.vertices[a], mesh.vertices[c] - mesh.vertices[a]);
    if (normal.lengthSquared() <= kDegenerateTriangleAreaSquared) return;
    if (normal.dot(outward) >= 0.0f) {
      mesh.quads.push_back({
        static_cast<std::uint32_t>(a),
        static_cast<std::uint32_t>(b),
        static_cast<std::uint32_t>(c),
        static_cast<std::uint32_t>(d),
      });
    } else {
      mesh.quads.push_back({
        static_cast<std::uint32_t>(a),
        static_cast<std::uint32_t>(d),
        static_cast<std::uint32_t>(c),
        static_cast<std::uint32_t>(b),
      });
    }
  };

  for (int z = 1; z < resolution; ++z) {
    for (int y = 1; y < resolution; ++y) {
      for (int x = 0; x < resolution; ++x) {
        if ((grid.value(x, y, z) < 0.0f) == (grid.value(x + 1, y, z) < 0.0f)) continue;
        const int a = cellVertices[cellIndex(x, y - 1, z - 1)];
        const int b = cellVertices[cellIndex(x, y, z - 1)];
        const int c = cellVertices[cellIndex(x, y, z)];
        const int d = cellVertices[cellIndex(x, y - 1, z)];
        const Vec3 outward = grid.value(x, y, z) < 0.0f ? Vec3{1, 0, 0} : Vec3{-1, 0, 0};
        addQuad(a, b, c, d, outward);
      }
    }
  }
  for (int z = 1; z < resolution; ++z) {
    for (int y = 0; y < resolution; ++y) {
      for (int x = 1; x < resolution; ++x) {
        if ((grid.value(x, y, z) < 0.0f) == (grid.value(x, y + 1, z) < 0.0f)) continue;
        const int a = cellVertices[cellIndex(x - 1, y, z - 1)];
        const int b = cellVertices[cellIndex(x, y, z - 1)];
        const int c = cellVertices[cellIndex(x, y, z)];
        const int d = cellVertices[cellIndex(x - 1, y, z)];
        const Vec3 outward = grid.value(x, y, z) < 0.0f ? Vec3{0, 1, 0} : Vec3{0, -1, 0};
        addQuad(a, b, c, d, outward);
      }
    }
  }
  for (int z = 0; z < resolution; ++z) {
    for (int y = 1; y < resolution; ++y) {
      for (int x = 1; x < resolution; ++x) {
        if ((grid.value(x, y, z) < 0.0f) == (grid.value(x, y, z + 1) < 0.0f)) continue;
        const int a = cellVertices[cellIndex(x - 1, y - 1, z)];
        const int b = cellVertices[cellIndex(x, y - 1, z)];
        const int c = cellVertices[cellIndex(x, y, z)];
        const int d = cellVertices[cellIndex(x - 1, y, z)];
        const Vec3 outward = grid.value(x, y, z) < 0.0f ? Vec3{0, 0, 1} : Vec3{0, 0, -1};
        addQuad(a, b, c, d, outward);
      }
    }
  }

  mesh.rebuildDerivedData();
  return mesh;
}

void MarchingCubes::polygonizeTetra(const std::array<Vec3, 4>& points, const std::array<float, 4>& values, Mesh& mesh) const {
  std::array<int, 4> inside{};
  std::array<int, 4> outside{};
  int insideCount = 0;
  int outsideCount = 0;
  for (int index = 0; index < 4; ++index) {
    if (values[index] < 0.0f) inside[insideCount++] = index;
    else outside[outsideCount++] = index;
  }
  if (insideCount == 0 || insideCount == 4) return;

  if (insideCount == 1) {
    const int i = inside[0];
    const Vec3 outward = ((points[outside[0]] + points[outside[1]] + points[outside[2]]) * (1.0f / 3.0f)) - points[i];
    addTriangle(
      mesh,
      interpolate(points[i], points[outside[0]], values[i], values[outside[0]]),
      interpolate(points[i], points[outside[1]], values[i], values[outside[1]]),
      interpolate(points[i], points[outside[2]], values[i], values[outside[2]]),
      outward);
  } else if (insideCount == 3) {
    const int o = outside[0];
    const Vec3 inward = (points[inside[0]] + points[inside[1]] + points[inside[2]]) * (1.0f / 3.0f);
    const Vec3 outward = points[o] - inward;
    addTriangle(
      mesh,
      interpolate(points[o], points[inside[0]], values[o], values[inside[0]]),
      interpolate(points[o], points[inside[1]], values[o], values[inside[1]]),
      interpolate(points[o], points[inside[2]], values[o], values[inside[2]]),
      outward);
  } else {
    const int i0 = inside[0];
    const int i1 = inside[1];
    const int o0 = outside[0];
    const int o1 = outside[1];
    const Vec3 outward = ((points[o0] + points[o1]) * 0.5f) - ((points[i0] + points[i1]) * 0.5f);
    const Vec3 p0 = interpolate(points[i0], points[o0], values[i0], values[o0]);
    const Vec3 p1 = interpolate(points[i1], points[o0], values[i1], values[o0]);
    const Vec3 p2 = interpolate(points[i1], points[o1], values[i1], values[o1]);
    const Vec3 p3 = interpolate(points[i0], points[o1], values[i0], values[o1]);
    addTriangle(mesh, p0, p1, p2, outward);
    addTriangle(mesh, p0, p2, p3, outward);
  }
}

Vec3 MarchingCubes::interpolate(const Vec3& a, const Vec3& b, float va, float vb) const {
  const float denominator = va - vb;
  const float t = std::abs(denominator) <= kEpsilon ? 0.5f : std::clamp(va / denominator, 0.0f, 1.0f);
  return a + (b - a) * t;
}

Mesh MeshOptimizer::optimize(const Mesh& input, float weldEpsilon) const {
  Mesh output;
  const float scale = 1.0f / std::max(weldEpsilon, 1e-6f);
  std::unordered_map<std::string, std::uint32_t> remap;
  auto addVertex = [&](const Vec3& vertex) {
    const auto key = vertexKey(vertex, scale);
    const auto found = remap.find(key);
    if (found != remap.end()) return found->second;
    const auto index = static_cast<std::uint32_t>(output.vertices.size());
    output.vertices.push_back(vertex);
    remap[key] = index;
    return index;
  };

  if (!input.quads.empty()) {
    for (const auto& quad : input.quads) {
      if (quad[0] >= input.vertices.size() || quad[1] >= input.vertices.size() ||
          quad[2] >= input.vertices.size() || quad[3] >= input.vertices.size()) continue;
      const auto a = addVertex(input.vertices[quad[0]]);
      const auto b = addVertex(input.vertices[quad[1]]);
      const auto c = addVertex(input.vertices[quad[2]]);
      const auto d = addVertex(input.vertices[quad[3]]);
      if (a == b || b == c || c == d || d == a || a == c || b == d) continue;
      const auto normal = cross(output.vertices[b] - output.vertices[a], output.vertices[c] - output.vertices[a]);
      if (normal.lengthSquared() <= kDegenerateTriangleAreaSquared) continue;
      output.quads.push_back({a, b, c, d});
    }
  } else {
    for (const auto& triangle : input.triangles) {
      if (triangle[0] >= input.vertices.size() || triangle[1] >= input.vertices.size() || triangle[2] >= input.vertices.size()) continue;
      const auto a = addVertex(input.vertices[triangle[0]]);
      const auto b = addVertex(input.vertices[triangle[1]]);
      const auto c = addVertex(input.vertices[triangle[2]]);
      if (a == b || b == c || c == a) continue;
      const auto normal = cross(output.vertices[b] - output.vertices[a], output.vertices[c] - output.vertices[a]);
      if (normal.lengthSquared() <= kDegenerateTriangleAreaSquared) continue;
      output.triangles.push_back({a, b, c});
    }
  }
  output.rebuildDerivedData();
  return output;
}

void MeshRelaxer::relax(Mesh& mesh, int iterations, float amount) const {
  if (iterations <= 0) return;
  for (int iteration = 0; iteration < iterations; ++iteration) {
    tangentialPass(mesh, amount);
    tangentialPass(mesh, -amount * 0.53f);
  }
}

void MeshRelaxer::tangentialPass(Mesh& mesh, float amount) const {
  if (mesh.vertices.empty()) return;
  mesh.rebuildDerivedData();
  auto next = mesh.vertices;
  for (std::size_t vertex = 0; vertex < mesh.vertices.size(); ++vertex) {
    if (mesh.neighbors[vertex].empty()) continue;
    Vec3 average{};
    for (const auto neighbor : mesh.neighbors[vertex]) average += mesh.vertices[neighbor];
    average = average * (1.0f / static_cast<float>(mesh.neighbors[vertex].size()));
    Vec3 delta = average - mesh.vertices[vertex];
    const Vec3 normal = mesh.normals[vertex];
    delta = delta - normal * delta.dot(normal);
    next[vertex] = mesh.vertices[vertex] + delta * amount;
  }
  mesh.vertices = std::move(next);
  mesh.rebuildDerivedData();
}

void MeshRegularizer::regularize(Mesh& mesh, int iterations, float amount) const {
  if (iterations <= 0 || mesh.vertices.empty()) return;
  const float clampedAmount = std::clamp(amount, 0.0f, 0.35f);
  for (int iteration = 0; iteration < iterations; ++iteration) {
    valencePass(mesh, clampedAmount);
    edgeLengthPass(mesh, clampedAmount * 0.75f);
    if (!mesh.quads.empty()) quadShapePass(mesh, clampedAmount * 0.5f);
  }
}

void MeshRegularizer::valencePass(Mesh& mesh, float amount) const {
  mesh.rebuildDerivedData();
  auto next = mesh.vertices;
  for (std::size_t vertex = 0; vertex < mesh.vertices.size(); ++vertex) {
    const auto& neighbors = mesh.neighbors[vertex];
    if (neighbors.empty()) continue;

    Vec3 average{};
    for (const auto neighbor : neighbors) average += mesh.vertices[neighbor];
    average = average * (1.0f / static_cast<float>(neighbors.size()));

    Vec3 delta = removeNormalComponent(average - mesh.vertices[vertex], mesh.normals[vertex]);
    const int valence = static_cast<int>(neighbors.size());
    const float valenceWeight = valence == 4 ? 1.0f : 0.28f;
    next[vertex] = mesh.vertices[vertex] + delta * (amount * valenceWeight);
  }
  mesh.vertices = std::move(next);
  mesh.rebuildDerivedData();
}

void MeshRegularizer::edgeLengthPass(Mesh& mesh, float amount) const {
  mesh.rebuildDerivedData();
  std::vector<std::pair<std::uint32_t, std::uint32_t>> edges;
  std::unordered_map<std::uint64_t, bool> seen;
  auto addEdge = [&](std::uint32_t a, std::uint32_t b) {
    if (a >= mesh.vertices.size() || b >= mesh.vertices.size() || a == b) return;
    const auto key = edgeKey(a, b);
    if (seen.find(key) != seen.end()) return;
    seen[key] = true;
    edges.push_back({a, b});
  };

  if (!mesh.quads.empty()) {
    for (const auto& quad : mesh.quads) {
      for (int index = 0; index < 4; ++index) addEdge(quad[index], quad[(index + 1) % 4]);
    }
  } else {
    for (const auto& triangle : mesh.triangles) {
      for (int index = 0; index < 3; ++index) addEdge(triangle[index], triangle[(index + 1) % 3]);
    }
  }
  if (edges.empty()) return;

  std::vector<float> localLength(mesh.vertices.size(), 0.0f);
  std::vector<int> localCount(mesh.vertices.size(), 0);
  for (const auto& [a, b] : edges) {
    const float length = (mesh.vertices[b] - mesh.vertices[a]).length();
    localLength[a] += length;
    localLength[b] += length;
    ++localCount[a];
    ++localCount[b];
  }
  for (std::size_t vertex = 0; vertex < localLength.size(); ++vertex) {
    if (localCount[vertex] > 0) localLength[vertex] /= static_cast<float>(localCount[vertex]);
  }

  std::vector<Vec3> deltas(mesh.vertices.size());
  std::vector<int> counts(mesh.vertices.size(), 0);
  for (const auto& [a, b] : edges) {
    Vec3 edge = mesh.vertices[b] - mesh.vertices[a];
    const float length = edge.length();
    if (length <= kEpsilon) continue;

    const float target = (localLength[a] + localLength[b]) * 0.5f;
    const float limitedCorrection = std::clamp((length - target) * 0.5f, -length * 0.12f, length * 0.12f);
    const Vec3 direction = edge * (1.0f / length);
    Vec3 deltaA = removeNormalComponent(direction * limitedCorrection, mesh.normals[a]);
    Vec3 deltaB = removeNormalComponent(direction * -limitedCorrection, mesh.normals[b]);
    deltas[a] += deltaA;
    deltas[b] += deltaB;
    ++counts[a];
    ++counts[b];
  }

  for (std::size_t vertex = 0; vertex < mesh.vertices.size(); ++vertex) {
    if (counts[vertex] == 0) continue;
    mesh.vertices[vertex] += deltas[vertex] * (amount / static_cast<float>(counts[vertex]));
  }
  mesh.rebuildDerivedData();
}

void MeshRegularizer::quadShapePass(Mesh& mesh, float amount) const {
  mesh.rebuildDerivedData();
  std::vector<Vec3> deltas(mesh.vertices.size());
  std::vector<int> counts(mesh.vertices.size(), 0);

  for (const auto& quad : mesh.quads) {
    if (quad[0] >= mesh.vertices.size() || quad[1] >= mesh.vertices.size() ||
        quad[2] >= mesh.vertices.size() || quad[3] >= mesh.vertices.size()) continue;

    const Vec3 v0 = mesh.vertices[quad[0]];
    const Vec3 v1 = mesh.vertices[quad[1]];
    const Vec3 v2 = mesh.vertices[quad[2]];
    const Vec3 v3 = mesh.vertices[quad[3]];
    const Vec3 center = (v0 + v1 + v2 + v3) * 0.25f;
    const Vec3 axisU = ((v1 + v2) - (v0 + v3)) * 0.25f;
    const Vec3 axisV = ((v2 + v3) - (v0 + v1)) * 0.25f;
    const std::array<Vec3, 4> targets = {
      center - axisU - axisV,
      center + axisU - axisV,
      center + axisU + axisV,
      center - axisU + axisV,
    };

    for (int index = 0; index < 4; ++index) {
      const auto vertex = quad[index];
      Vec3 delta = removeNormalComponent(targets[index] - mesh.vertices[vertex], mesh.normals[vertex]);
      deltas[vertex] += delta;
      ++counts[vertex];
    }
  }

  for (std::size_t vertex = 0; vertex < mesh.vertices.size(); ++vertex) {
    if (counts[vertex] == 0) continue;
    mesh.vertices[vertex] += deltas[vertex] * (amount / static_cast<float>(counts[vertex]));
  }
  mesh.rebuildDerivedData();
}

std::vector<QuadFlowField::Frame> QuadFlowField::buildFrames(const Mesh& mesh) const {
  std::vector<Frame> frames(mesh.vertices.size());
  Vec3 center{};
  if (!mesh.vertices.empty()) {
    for (const auto& vertex : mesh.vertices) center += vertex;
    center = center * (1.0f / static_cast<float>(mesh.vertices.size()));
  }
  constexpr Vec3 up{0.0f, 1.0f, 0.0f};
  for (std::size_t vertex = 0; vertex < mesh.vertices.size(); ++vertex) {
    Vec3 normal = vertex < mesh.normals.size() ? mesh.normals[vertex] : Vec3{0.0f, 1.0f, 0.0f};
    if (normal.lengthSquared() <= kEpsilon) normal = {0.0f, 1.0f, 0.0f};
    normal = normal.normalized();

    Vec3 radial{mesh.vertices[vertex].x - center.x, 0.0f, mesh.vertices[vertex].z - center.z};
    Vec3 circumferential = radial.lengthSquared() > kEpsilon ? cross(up, radial).normalized() : Vec3{1.0f, 0.0f, 0.0f};
    Vec3 u = removeNormalComponent(circumferential, normal);
    if (u.lengthSquared() <= kEpsilon) u = removeNormalComponent(up, normal);
    if (u.lengthSquared() <= kEpsilon) u = removeNormalComponent(Vec3{0.0f, 0.0f, 1.0f}, normal);
    u = u.normalized();
    Vec3 v = cross(normal, u).normalized();
    frames[vertex] = {u, v};
  }
  return frames;
}

void QuadFlowField::smoothFrames(const Mesh& mesh, std::vector<Frame>& frames, int iterations) const {
  if (frames.empty() || iterations <= 0) return;
  for (int iteration = 0; iteration < iterations; ++iteration) {
    auto next = frames;
    for (std::size_t vertex = 0; vertex < frames.size(); ++vertex) {
      if (vertex >= mesh.neighbors.size() || mesh.neighbors[vertex].empty()) continue;
      Vec3 normal = vertex < mesh.normals.size() ? mesh.normals[vertex] : Vec3{0.0f, 1.0f, 0.0f};
      if (normal.lengthSquared() <= kEpsilon) continue;
      normal = normal.normalized();

      Vec3 u = frames[vertex].u;
      for (const auto neighbor : mesh.neighbors[vertex]) {
        if (neighbor >= frames.size()) continue;
        Vec3 neighborU = frames[neighbor].u;
        if (u.dot(neighborU) < 0.0f) neighborU = neighborU * -1.0f;
        u += neighborU;
      }
      u = removeNormalComponent(u, normal);
      if (u.lengthSquared() <= kEpsilon) continue;
      u = u.normalized();
      next[vertex] = {u, cross(normal, u).normalized()};
    }
    frames = std::move(next);
  }
}

void QuadFlowField::flowPass(Mesh& mesh, const std::vector<Frame>& frames, float amount) const {
  mesh.rebuildDerivedData();
  std::vector<Vec3> deltas(mesh.vertices.size());
  std::vector<int> counts(mesh.vertices.size(), 0);

  for (std::size_t vertex = 0; vertex < mesh.vertices.size(); ++vertex) {
    if (vertex >= mesh.neighbors.size() || vertex >= frames.size()) continue;
    const auto& neighbors = mesh.neighbors[vertex];
    if (neighbors.size() < 3) continue;

    const Vec3 origin = mesh.vertices[vertex];
    const Vec3 normal = vertex < mesh.normals.size() ? mesh.normals[vertex] : Vec3{};
    const Vec3 u = frames[vertex].u;
    const Vec3 v = frames[vertex].v;
    Vec3 uPositive{}, uNegative{}, vPositive{}, vNegative{};
    float uPositiveScore = 0.0f;
    float uNegativeScore = 0.0f;
    float vPositiveScore = 0.0f;
    float vNegativeScore = 0.0f;

    for (const auto neighbor : neighbors) {
      if (neighbor >= mesh.vertices.size()) continue;
      const Vec3 edge = removeNormalComponent(mesh.vertices[neighbor] - origin, normal);
      if (edge.lengthSquared() <= kEpsilon) continue;
      const float uScore = edge.dot(u);
      const float vScore = edge.dot(v);
      if (std::abs(uScore) >= std::abs(vScore)) {
        if (uScore >= 0.0f && std::abs(uScore) > uPositiveScore) {
          uPositiveScore = std::abs(uScore);
          uPositive = mesh.vertices[neighbor];
        } else if (uScore < 0.0f && std::abs(uScore) > uNegativeScore) {
          uNegativeScore = std::abs(uScore);
          uNegative = mesh.vertices[neighbor];
        }
      } else {
        if (vScore >= 0.0f && std::abs(vScore) > vPositiveScore) {
          vPositiveScore = std::abs(vScore);
          vPositive = mesh.vertices[neighbor];
        } else if (vScore < 0.0f && std::abs(vScore) > vNegativeScore) {
          vNegativeScore = std::abs(vScore);
          vNegative = mesh.vertices[neighbor];
        }
      }
    }

    Vec3 target{};
    int axes = 0;
    if (uPositiveScore > 0.0f && uNegativeScore > 0.0f) {
      target += (uPositive + uNegative) * 0.5f;
      ++axes;
    }
    if (vPositiveScore > 0.0f && vNegativeScore > 0.0f) {
      target += (vPositive + vNegative) * 0.5f;
      ++axes;
    }
    if (axes == 0) continue;

    target = target * (1.0f / static_cast<float>(axes));
    const float valenceWeight = neighbors.size() == 4 ? 1.0f : 0.38f;
    deltas[vertex] += removeNormalComponent(target - origin, normal) * valenceWeight;
    ++counts[vertex];
  }

  for (std::size_t vertex = 0; vertex < mesh.vertices.size(); ++vertex) {
    if (counts[vertex] == 0) continue;
    mesh.vertices[vertex] += deltas[vertex] * (amount / static_cast<float>(counts[vertex]));
  }
  mesh.rebuildDerivedData();
}

void QuadFlowField::align(Mesh& mesh, int iterations, float amount) const {
  if (iterations <= 0 || mesh.vertices.empty()) return;
  const float clampedAmount = std::clamp(amount, 0.0f, 0.35f);
  for (int iteration = 0; iteration < iterations; ++iteration) {
    mesh.rebuildDerivedData();
    auto frames = buildFrames(mesh);
    smoothFrames(mesh, frames, 4);
    flowPass(mesh, frames, clampedAmount);
  }
}

void MeshProjector::project(Mesh& remeshed, const Mesh& source, float maxDistance, float strength) const {
  const float maxDistanceSquared = maxDistance * maxDistance;
  const float clampedStrength = std::clamp(strength, 0.0f, 1.0f);
  for (auto& vertex : remeshed.vertices) {
    float closestDistance = maxDistanceSquared;
    Vec3 closest = vertex;
    for (const auto& triangle : source.triangles) {
      if (triangle[0] >= source.vertices.size() || triangle[1] >= source.vertices.size() || triangle[2] >= source.vertices.size()) continue;
      const Vec3 a = source.vertices[triangle[0]];
      const Vec3 b = source.vertices[triangle[1]];
      const Vec3 c = source.vertices[triangle[2]];
      const Vec3 projected = closestPointOnTriangle(vertex, a, b, c);
      const float distance = (vertex - projected).lengthSquared();
      if (distance >= closestDistance) continue;
      closestDistance = distance;
      closest = projected;
    }
    vertex = vertex + (closest - vertex) * clampedStrength;
  }
  remeshed.rebuildDerivedData();
}

Mesh PixRemesh::remesh(const Mesh& source, const PixRemeshOptions& options) const {
  VoxelGrid grid = sdf_.build(source, options);
  Mesh reconstructed = reconstruction_.reconstruct(grid);
  const float adaptiveWeld = grid.voxelSize() * (0.0025f + std::clamp(options.adaptiveDensity, 0.0f, 1.0f) * 0.02f);
  const float relaxAmount = options.preserveSharpFeatures ? 0.12f : 0.25f;
  const float regularityAmount = options.preserveSharpFeatures ? 0.08f : 0.15f;
  Mesh optimized = optimizer_.optimize(reconstructed, adaptiveWeld);
  orientFacesAwayFromCenter(optimized);
  optimized.rebuildDerivedData();
  flowField_.align(optimized, std::max(1, options.smoothIterations), options.preserveSharpFeatures ? 0.08f : 0.16f);
  regularizer_.regularize(optimized, std::max(1, options.smoothIterations), regularityAmount);
  if (options.projectDetails) {
    projector_.project(optimized, source, grid.voxelSize() * 1.75f, options.preserveSharpFeatures ? 0.28f : 0.18f);
  }
  relaxer_.relax(optimized, std::max(0, options.smoothIterations), relaxAmount);
  if (options.projectDetails) {
    projector_.project(optimized, source, grid.voxelSize() * 2.5f, options.preserveSharpFeatures ? 0.45f : 0.32f);
    optimized = optimizer_.optimize(optimized, adaptiveWeld);
    orientFacesAwayFromCenter(optimized);
    optimized.rebuildDerivedData();
    flowField_.align(optimized, options.preserveSharpFeatures ? 1 : 2, options.preserveSharpFeatures ? 0.05f : 0.1f);
    regularizer_.regularize(optimized, options.preserveSharpFeatures ? 1 : 2, regularityAmount * 0.7f);
    relaxer_.relax(optimized, options.preserveSharpFeatures ? 1 : 2, relaxAmount * 0.55f);
    projector_.project(optimized, source, grid.voxelSize() * 1.5f, options.preserveSharpFeatures ? 0.35f : 0.24f);
  }
  orientFacesAwayFromCenter(optimized);
  optimized.rebuildDerivedData();
  return optimized;
}

PixRemeshStats PixRemesh::preview(const Mesh& source, const PixRemeshOptions& options) const {
  const Mesh mesh = remesh(source, options);
  return {
    static_cast<std::uint32_t>(mesh.vertices.size()),
    static_cast<std::uint32_t>(mesh.indices.size() / 3),
  };
}
