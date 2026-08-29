cmake_minimum_required(VERSION 3.14)
project(lombokecc VERSION 0.2.0 LANGUAGES CXX)

add_library(lombok_ecc INTERFACE)
target_include_directories(lombok_ecc INTERFACE
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>)
target_compile_features(lombok_ecc INTERFACE cxx_std_17)

enable_testing()
add_executable(check_vectors tests/check_vectors.cpp)
target_link_libraries(check_vectors PRIVATE lombok_ecc)
add_test(NAME vectors
  COMMAND check_vectors ${CMAKE_CURRENT_SOURCE_DIR}/../vectors/lombok-ecc-vectors-v1.txt)
