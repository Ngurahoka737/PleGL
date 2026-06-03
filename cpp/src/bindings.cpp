#include "SculptEngine.hpp"
#include <emscripten/bind.h>

using namespace emscripten;
EMSCRIPTEN_BINDINGS(sculpt_engine) {
  register_vector<float>("FloatVector");
  register_vector<std::uint32_t>("UIntVector");
  class_<SculptEngine>("SculptEngine")
    .constructor<>()
    .function("createQuadSphere", &SculptEngine::createQuadSphere)
    .function("subdivideCurrent", &SculptEngine::subdivideCurrent)
    .function("restoreCoarseLevel", &SculptEngine::restoreCoarseLevel)
    .function("applyDraw", &SculptEngine::applyDraw)
    .function("applySmooth", &SculptEngine::applySmooth)
    .function("applyClay", &SculptEngine::applyClay)
    .function("beginMove", &SculptEngine::beginMove)
    .function("applyMove", &SculptEngine::applyMove)
    .function("beginStroke", &SculptEngine::beginStroke)
    .function("undo", &SculptEngine::undo)
    .function("redo", &SculptEngine::redo)
    .function("positions", optional_override([](const SculptEngine& e) { return e.mesh().packedPositions(); }))
    .function("normals", optional_override([](const SculptEngine& e) { return e.mesh().packedNormals(); }))
    .function("indices", optional_override([](const SculptEngine& e) { return e.mesh().indices; }));
}
