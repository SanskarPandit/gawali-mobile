if(NOT TARGET fbjni::fbjni)
add_library(fbjni::fbjni SHARED IMPORTED)
set_target_properties(fbjni::fbjni PROPERTIES
    IMPORTED_LOCATION "C:/Users/anike/.gradle/caches/8.10.2/transforms/11a1cbc2cd06d01dd245b60262234e38/transformed/fbjni-0.7.0/prefab/modules/fbjni/libs/android.arm64-v8a/libfbjni.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/anike/.gradle/caches/8.10.2/transforms/11a1cbc2cd06d01dd245b60262234e38/transformed/fbjni-0.7.0/prefab/modules/fbjni/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

