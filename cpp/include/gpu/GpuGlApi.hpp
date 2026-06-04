#pragma once
#include <cstddef>
#include <cstdint>

using GLenum = std::uint32_t;
using GLuint = std::uint32_t;
using GLint = std::int32_t;
using GLsizei = std::int32_t;
using GLbitfield = std::uint32_t;
using GLsizeiptr = std::ptrdiff_t;
using GLintptr = std::ptrdiff_t;
using GLchar = char;

constexpr GLenum GL_COMPUTE_SHADER_VALUE = 0x91B9;
constexpr GLenum GL_SHADER_STORAGE_BUFFER_VALUE = 0x90D2;
constexpr GLenum GL_DYNAMIC_DRAW_VALUE = 0x88E8;
constexpr GLenum GL_COMPILE_STATUS_VALUE = 0x8B81;
constexpr GLenum GL_LINK_STATUS_VALUE = 0x8B82;
constexpr GLenum GL_INFO_LOG_LENGTH_VALUE = 0x8B84;
constexpr GLbitfield GL_SHADER_STORAGE_BARRIER_BIT_VALUE = 0x2000;
constexpr GLbitfield GL_VERTEX_ATTRIB_ARRAY_BARRIER_BIT_VALUE = 0x00000001;

struct GpuGlApi {
  GLuint (*createShader)(GLenum type) = nullptr;
  void (*shaderSource)(GLuint shader, GLsizei count, const GLchar* const* string, const GLint* length) = nullptr;
  void (*compileShader)(GLuint shader) = nullptr;
  void (*getShaderiv)(GLuint shader, GLenum pname, GLint* params) = nullptr;
  void (*getShaderInfoLog)(GLuint shader, GLsizei maxLength, GLsizei* length, GLchar* infoLog) = nullptr;
  void (*deleteShader)(GLuint shader) = nullptr;

  GLuint (*createProgram)() = nullptr;
  void (*attachShader)(GLuint program, GLuint shader) = nullptr;
  void (*linkProgram)(GLuint program) = nullptr;
  void (*getProgramiv)(GLuint program, GLenum pname, GLint* params) = nullptr;
  void (*getProgramInfoLog)(GLuint program, GLsizei maxLength, GLsizei* length, GLchar* infoLog) = nullptr;
  void (*deleteProgram)(GLuint program) = nullptr;
  void (*useProgram)(GLuint program) = nullptr;

  void (*genBuffers)(GLsizei n, GLuint* buffers) = nullptr;
  void (*deleteBuffers)(GLsizei n, const GLuint* buffers) = nullptr;
  void (*bindBuffer)(GLenum target, GLuint buffer) = nullptr;
  void (*bufferData)(GLenum target, GLsizeiptr size, const void* data, GLenum usage) = nullptr;
  void (*bufferSubData)(GLenum target, GLintptr offset, GLsizeiptr size, const void* data) = nullptr;
  void (*bindBufferBase)(GLenum target, GLuint index, GLuint buffer) = nullptr;

  void (*dispatchCompute)(GLuint num_groups_x, GLuint num_groups_y, GLuint num_groups_z) = nullptr;
  void (*memoryBarrier)(GLbitfield barriers) = nullptr;
  GLenum (*getError)() = nullptr;
};

inline bool hasRequiredComputeApi(const GpuGlApi& gl) {
  return gl.createShader && gl.shaderSource && gl.compileShader && gl.getShaderiv &&
         gl.getShaderInfoLog && gl.deleteShader && gl.createProgram && gl.attachShader &&
         gl.linkProgram && gl.getProgramiv && gl.getProgramInfoLog && gl.deleteProgram &&
         gl.useProgram && gl.genBuffers && gl.deleteBuffers && gl.bindBuffer &&
         gl.bufferData && gl.bufferSubData && gl.bindBufferBase && gl.dispatchCompute &&
         gl.memoryBarrier;
}
