#include "gpu/GpuMeshBuffer.hpp"
#include <algorithm>
#include <set>

namespace {
std::vector<GpuVec4> packVec3(const std::vector<Vec3>& values, float w) {
  std::vector<GpuVec4> result;
  result.reserve(values.size());
  for (const auto& value : values) result.push_back({value.x, value.y, value.z, w});
  return result;
}
}

GpuMeshBuffer::GpuMeshBuffer(const GpuGlApi& gl) : gl_(gl) {}
GpuMeshBuffer::~GpuMeshBuffer() { destroy(); }

bool GpuMeshBuffer::upload(const Mesh& mesh, std::string* error) {
  if (!hasRequiredComputeApi(gl_)) {
    if (error) *error = "OpenGL compute API functions are not loaded.";
    return false;
  }

  destroy();
  vertexCount_ = static_cast<std::uint32_t>(mesh.vertices.size());
  indexCount_ = static_cast<std::uint32_t>(mesh.indices.size());

  const auto packedPositions = packVec3(mesh.vertices, 1.0f);
  const auto packedNormals = packVec3(mesh.normals, 0.0f);
  std::vector<std::uint32_t> neighborOffsets;
  std::vector<std::uint32_t> neighborIndices;
  buildAdjacency(mesh, neighborOffsets, neighborIndices);

  return createBuffer(positionBuffer_, static_cast<GLsizeiptr>(packedPositions.size() * sizeof(GpuVec4)), packedPositions.data(), error) &&
         createBuffer(normalBuffer_, static_cast<GLsizeiptr>(packedNormals.size() * sizeof(GpuVec4)), packedNormals.data(), error) &&
         createBuffer(neighborOffsetBuffer_, static_cast<GLsizeiptr>(neighborOffsets.size() * sizeof(std::uint32_t)), neighborOffsets.data(), error) &&
         createBuffer(neighborIndexBuffer_, static_cast<GLsizeiptr>(neighborIndices.size() * sizeof(std::uint32_t)), neighborIndices.data(), error) &&
         createBuffer(indexBuffer_, static_cast<GLsizeiptr>(mesh.indices.size() * sizeof(std::uint32_t)), mesh.indices.data(), error);
}

void GpuMeshBuffer::bindForCompute() const {
  gl_.bindBufferBase(GL_SHADER_STORAGE_BUFFER_VALUE, 0, positionBuffer_);
  gl_.bindBufferBase(GL_SHADER_STORAGE_BUFFER_VALUE, 1, normalBuffer_);
  gl_.bindBufferBase(GL_SHADER_STORAGE_BUFFER_VALUE, 2, neighborOffsetBuffer_);
  gl_.bindBufferBase(GL_SHADER_STORAGE_BUFFER_VALUE, 3, neighborIndexBuffer_);
}

void GpuMeshBuffer::destroy() {
  const GLuint buffers[] = {positionBuffer_, normalBuffer_, neighborOffsetBuffer_, neighborIndexBuffer_, indexBuffer_};
  for (const GLuint buffer : buffers) {
    if (!buffer || !gl_.deleteBuffers) continue;
    gl_.deleteBuffers(1, &buffer);
  }
  positionBuffer_ = normalBuffer_ = neighborOffsetBuffer_ = neighborIndexBuffer_ = indexBuffer_ = 0;
  vertexCount_ = indexCount_ = 0;
}

bool GpuMeshBuffer::createBuffer(GLuint& buffer, GLsizeiptr size, const void* data, std::string* error) {
  gl_.genBuffers(1, &buffer);
  if (!buffer) {
    if (error) *error = "Failed to create OpenGL buffer.";
    return false;
  }
  gl_.bindBuffer(GL_SHADER_STORAGE_BUFFER_VALUE, buffer);
  gl_.bufferData(GL_SHADER_STORAGE_BUFFER_VALUE, size, data, GL_DYNAMIC_DRAW_VALUE);
  if (gl_.getError && gl_.getError() != 0) {
    if (error) *error = "OpenGL error while uploading mesh buffer.";
    return false;
  }
  return true;
}

void GpuMeshBuffer::buildAdjacency(const Mesh& mesh, std::vector<std::uint32_t>& offsets, std::vector<std::uint32_t>& indices) const {
  std::vector<std::set<std::uint32_t>> adjacency(mesh.vertices.size());
  for (const auto& quad : mesh.quads) {
    for (int i = 0; i < 4; ++i) {
      const auto a = quad[i];
      const auto b = quad[(i + 1) % 4];
      adjacency[a].insert(b);
      adjacency[b].insert(a);
    }
  }

  offsets.resize(mesh.vertices.size() + 1);
  for (std::size_t vertex = 0; vertex < adjacency.size(); ++vertex) {
    offsets[vertex] = static_cast<std::uint32_t>(indices.size());
    indices.insert(indices.end(), adjacency[vertex].begin(), adjacency[vertex].end());
  }
  offsets.back() = static_cast<std::uint32_t>(indices.size());
}
