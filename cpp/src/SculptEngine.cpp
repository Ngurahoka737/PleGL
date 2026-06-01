#include "SculptEngine.hpp"

SculptEngine::SculptEngine() { createQuadSphere(1.0f, 5); }
void SculptEngine::createQuadSphere(float radius, int level) { mesh_ = PrimitiveGenerator::quadSphere(radius, level); }
void SculptEngine::subdivideCurrent() { PrimitiveGenerator::subdivideCurrent(mesh_); }
bool SculptEngine::applyDraw(float x,float y,float z,float radius,float strength,bool invert) {
  return Brush::draw(mesh_, {x,y,z}, {radius,strength,invert});
}
bool SculptEngine::applySmooth(float x,float y,float z,float radius,float strength) {
  return Brush::smooth(mesh_, {x,y,z}, {radius,strength,false});
}
bool SculptEngine::applyClay(float x,float y,float z,float nx,float ny,float nz,float radius,float strength,bool invert) {
  return Brush::clay(mesh_, {x,y,z}, {nx,ny,nz}, {radius,strength,invert});
}
void SculptEngine::beginStroke() { history_.push(mesh_); }
bool SculptEngine::undo() { return history_.undo(mesh_); }
bool SculptEngine::redo() { return history_.redo(mesh_); }
