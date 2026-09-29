if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "C:/Users/anike/.gradle/caches/8.10.2/transforms/a8fca3b5e3e8764f54cca58b2b43fab3/transformed/hermes-android-0.77.2-debug/prefab/modules/libhermes/libs/android.arm64-v8a/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/anike/.gradle/caches/8.10.2/transforms/a8fca3b5e3e8764f54cca58b2b43fab3/transformed/hermes-android-0.77.2-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

