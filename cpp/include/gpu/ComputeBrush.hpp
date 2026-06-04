#pragma once
#include "Math.hpp"
#include "gpu/GpuGlApi.hpp"
#include "gpu/GpuMeshBuffer.hpp"
#include <string>

enum class GpuBrushKind : std::uint32_t {
  Draw = 0,
  Smooth = 1,
  Inflate = 2,
  Move = 3,
};

struct GpuBrushParams {
  Vec3 center{};
  float radius = 0.24f;
  Vec3 delta{};
  float strength = 0.012f;
  std::uint32_t vertexCount = 0;
  std::uint32_t brushKind = 0;
  std::uint32_t invert = 0;
  std::uint32_t _padding = 0;
};

class ComputeBrush {
 public:
  explicit ComputeBrush(const GpuGlApi& gl);
  ~ComputeBrush();

  ComputeBrush(const ComputeBrush&) = delete;
  ComputeBrush& operator=(const ComputeBrush&) = delete;

  bool initializeFromFiles(const std::string& brushShaderPath, const std::string& normalShaderPath, std::string* error);
  bool initializeFromSource(const std::string& brushSource, const std::string& normalSource, std::string* error);
  bool isAvailable() const { return available_; }

  bool dispatch(GpuMeshBuffer& mesh, const GpuBrushParams& params, bool recalculateNormals, std::string* error);
  void destroy();

 private:
  bool compileProgram(const std::string& source, GLuint& program, std::string* error);
  bool updateParams(const GpuBrushParams& params, std::string* error);
  bool ensureParamBuffer(std::string* error);

  const GpuGlApi& gl_;
  GLuint brushProgram_ = 0;
  GLuint normalProgram_ = 0;
  GLuint paramBuffer_ = 0;
  bool available_ = false;
};
