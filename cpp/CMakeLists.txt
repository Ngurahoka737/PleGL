cmake_minimum_required(VERSION 3.20)
project(quad_sphere_sculpt)
set(CMAKE_CXX_STANDARD 20)
include_directories(include)
add_executable(sculpt-engine src/Mesh.cpp src/PrimitiveGenerator.cpp src/PixRemesh.cpp src/SculptEngine.cpp src/Brush.cpp src/HistoryManager.cpp src/bindings.cpp)
target_link_options(sculpt-engine PRIVATE --bind -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1)

option(PLEGL_BUILD_OPENGL_COMPUTE "Build optional desktop OpenGL compute sculpting module" OFF)
if(PLEGL_BUILD_OPENGL_COMPUTE)
  add_library(plegl-opengl-compute STATIC
    src/gpu/GpuMeshBuffer.cpp
    src/gpu/ComputeBrush.cpp
  )
  target_include_directories(plegl-opengl-compute PUBLIC include)
  target_compile_features(plegl-opengl-compute PUBLIC cxx_std_20)
endif()
