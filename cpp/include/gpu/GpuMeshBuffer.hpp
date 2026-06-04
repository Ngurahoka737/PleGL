#pragma once
#include "Mesh.hpp"
#include "gpu/GpuGlApi.hpp"
#include <string>
#include <vector>

struct GpuVec4 {
  float x = 0;
  float y = 0;
  float z = 0;
  float w = 0;
};

class GpuMeshBuffer {
 public:
  explicit GpuMeshBuffer(const GpuGlApi& gl);
  ~GpuMeshBuffer();

  GpuMeshBuffer(const GpuMeshBuffer&) = delete;
  GpuMeshBuffer& operator=(const GpuMeshBuffer&) = delete;

  bool upload(const Mesh& mesh, std::string* error);
  void bindForCompute() const;
  void destroy();

  GLuint positionBuffer() const { return positionBuffer_; }
  GLuint normalBuffer() const { return normalBuffer_; }
  GLuint neighborOffsetBuffer() const { return neighborOffsetBuffer_; }
  GLuint neighborIndexBuffer() const { return neighborIndexBuffer_; }
  GLuint indexBuffer() const { return indexBuffer_; }
  std::uint32_t vertexCount() const { return vertexCount_; }
  std::uint32_t indexCount() const { return indexCount_; }

 private:
  bool createBuffer(GLuint& buffer, GLsizeiptr size, const void* data, std::string* error);
  void buildAdjacency(const Mesh& mesh, std::vector<std::uint32_t>& offsets, std::vector<std::uint32_t>& indices) const;

  const GpuGlApi& gl_;
  GLuint positionBuffer_ = 0;
  GLuint normalBuffer_ = 0;
  GLuint neighborOffsetBuffer_ = 0;
  GLuint neighborIndexBuffer_ = 0;
  GLuint indexBuffer_ = 0;
  std::uint32_t vertexCount_ = 0;
  std::uint32_t indexCount_ = 0;
};
