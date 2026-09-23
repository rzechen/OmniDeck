{
  "targets": [
    {
      "target_name": "windows",
      "sources": ["windows.cpp"],
      "include_dirs": ["../node_modules/node-addon-api"],
      "macosx_deployment_target": "10.15",
      "defines": ["NAPI_VERSION=8"],
      "cflags_cc": ["-std=c++17", "-stdlib=libc++", "-fblocks"],
      "libraries": [
        "-framework CoreGraphics",
        "-framework ImageIO",
        "-weak_framework",
        "ScreenCaptureKit"
      ],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "MACOSX_DEPLOYMENT_TARGET": "10.15",
        "OTHER_LDFLAGS": ["-framework CoreGraphics"]
      }
    }
  ]
}
