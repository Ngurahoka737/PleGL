#include "gpu/ComputeBrush.hpp"
#include <fstream>
#include <sstream>
#include <vector>

namespace {
std::string readTextFile(const std::string& path) {
  std::ifstream file(path, std::ios::in | std::ios::binary);
  std::ostringstream stream;
  stream << file.rdbuf();
  return stream.str();
}
}

ComputeBrush::ComputeBrush(const GpuGlApi& gl) : gl_(gl) {}
ComputeBrush::~ComputeBrush() { destroy(); }

bool ComputeBrush::initializeFromFiles(const std::string& brushShaderPath, const std::string& normalShaderPath, std::string* error) {
  const std::string brushSource = readTextFile(brushShaderPath);
  const std::string normalSource = readTextFile(normalShaderPath);
  if (brushSource.empty() || normalSource.empty()) {
    if (error) *error = "Failed to read compute shader source files.";
    return false;
  }
  return initializeFromSource(brushSource, normalSource, error);
}

bool ComputeBrush::initializeFromSource(const std::string& brushSource, const std::string& normalSource, std::string* error) {
  if (!hasRequiredComputeApi(gl_)) {
    if (error) *error = "OpenGL compute API functions are not loaded.";
    available_ = false;
    return false;
  }
  destroy();
  if (!compileProgram(brushSource, brushProgram_, error)) return false;
  if (!compileProgram(normalSource, normalProgram_, error)) return false;
  if (!ensureParamBuffer(error)) return false;
  available_ = true;
  return true;
}

bool ComputeBrush::dispatch(GpuMeshBuffer& mesh, const GpuBrushParams& params, bool recalculateNormals, std::string* error) {
  if (!available_) {
    if (error) *error = "GPU compute brush is unavailable; use CPU fallback.";
    return false;
  }

  GpuBrushParams upload = params;
  upload.vertexCount = mesh.vertexCount();
  if (!updateParams(upload, error)) return false;

  mesh.bindForCompute();
  gl_.bindBufferBase(GL_SHADER_STORAGE_BUFFER_VALUE, 4, paramBuffer_);
  gl_.useProgram(brushProgram_);
  const GLuint groups = (mesh.vertexCount() + 127u) / 128u;
  gl_.dispatchCompute(groups, 1, 1);
  gl_.memoryBarrier(GL_SHADER_STORAGE_BARRIER_BIT_VALUE | GL_VERTEX_ATTRIB_ARRAY_BARRIER_BIT_VALUE);

  if (recalculateNormals && normalProgram_) {
    gl_.useProgram(normalProgram_);
    gl_.dispatchCompute(groups, 1, 1);
    gl_.memoryBarrier(GL_SHADER_STORAGE_BARRIER_BIT_VALUE | GL_VERTEX_ATTRIB_ARRAY_BARRIER_BIT_VALUE);
  }

  if (gl_.getError && gl_.getError() != 0) {
    if (error) *error = "OpenGL error while dispatching compute brush.";
    return false;
  }
  return true;
}

void ComputeBrush::destroy() {
  if (brushProgram_ && gl_.deleteProgram) gl_.deleteProgram(brushProgram_);
  if (normalProgram_ && gl_.deleteProgram) gl_.deleteProgram(normalProgram_);
  if (paramBuffer_ && gl_.deleteBuffers) gl_.deleteBuffers(1, &paramBuffer_);
  brushProgram_ = normalProgram_ = paramBuffer_ = 0;
  available_ = false;
}

bool ComputeBrush::compileProgram(const std::string& source, GLuint& program, std::string* error) {
  const GLuint shader = gl_.createShader(GL_COMPUTE_SHADER_VALUE);
  const GLchar* sourcePtr = source.c_str();
  gl_.shaderSource(shader, 1, &sourcePtr, nullptr);
  gl_.compileShader(shader);

  GLint status = 0;
  gl_.getShaderiv(shader, GL_COMPILE_STATUS_VALUE, &status);
  if (!status) {
    GLint length = 0;
    gl_.getShaderiv(shader, GL_INFO_LOG_LENGTH_VALUE, &length);
    std::vector<GLchar> log(static_cast<std::size_t>(length > 1 ? length : 1));
    gl_.getShaderInfoLog(shader, length, nullptr, log.data());
    if (error) *error = std::string("Compute shader compile failed: ") + log.data();
    gl_.deleteShader(shader);
    return false;
  }

  program = gl_.createProgram();
  gl_.attachShader(program, shader);
  gl_.linkProgram(program);
  gl_.deleteShader(shader);

  gl_.getProgramiv(program, GL_LINK_STATUS_VALUE, &status);
  if (!status) {
    GLint length = 0;
    gl_.getProgramiv(program, GL_INFO_LOG_LENGTH_VALUE, &length);
    std::vector<GLchar> log(static_cast<std::size_t>(length > 1 ? length : 1));
    gl_.getProgramInfoLog(program, length, nullptr, log.data());
    if (error) *error = std::string("Compute program link failed: ") + log.data();
    gl_.deleteProgram(program);
    program = 0;
    return false;
  }
  return true;
}

bool ComputeBrush::updateParams(const GpuBrushParams& params, std::string* error) {
  if (!ensureParamBuffer(error)) return false;
  gl_.bindBuffer(GL_SHADER_STORAGE_BUFFER_VALUE, paramBuffer_);
  gl_.bufferSubData(GL_SHADER_STORAGE_BUFFER_VALUE, 0, sizeof(GpuBrushParams), &params);
  return true;
}

bool ComputeBrush::ensureParamBuffer(std::string* error) {
  if (paramBuffer_) return true;
  gl_.genBuffers(1, &paramBuffer_);
  if (!paramBuffer_) {
    if (error) *error = "Failed to create brush parameter SSBO.";
    return false;
  }
  gl_.bindBuffer(GL_SHADER_STORAGE_BUFFER_VALUE, paramBuffer_);
  gl_.bufferData(GL_SHADER_STORAGE_BUFFER_VALUE, sizeof(GpuBrushParams), nullptr, GL_DYNAMIC_DRAW_VALUE);
  return true;
}
