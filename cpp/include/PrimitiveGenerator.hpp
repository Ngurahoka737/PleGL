#pragma once
#include "Mesh.hpp"

class PrimitiveGenerator {
 public:
  static Mesh quadSphere(float radius, int subdivisionLevel);
  static void subdivideCurrent(Mesh& mesh);
};
