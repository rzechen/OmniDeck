// OmniDeck macOS 窗口枚举 NAPI 插件（截图 hover 拾取用）
// CGWindowListCopyWindowInfo 枚举屏幕上可见的普通窗口（layer 0），
// 排除自身进程，返回列表供渲染层 Overlay 做鼠标命中测试与高亮。
//
// - 坐标系：CoreGraphics 全局显示坐标（点/DIP，主屏左上为原点，Y 向下），
//   与 Electron screen API 一致，主进程直接做本屏相对坐标换算
// - z 序：返回顺序为从前到后（最前面的窗口在数组头部），命中测试取第一个包含点者
// - 降级说明：kCGWindowName（窗口标题）在 macOS 10.15+ 无「屏幕录制」权限时
//   返回空，属系统隐私策略；owner（App 名）不受影响，hover 提示用 owner
// - NAPI（ABI 稳定）：用本机 Node headers 编译即可在 Electron 中加载，
//   无需按 Electron 版本单独编译

#include <napi.h>
#include <CoreGraphics/CoreGraphics.h>
#include <ImageIO/CGImageDestination.h>
#include <dispatch/dispatch.h>
#include <unistd.h>

#include <string>
#include <vector>

// ---------- ScreenCaptureKit 截屏（macOS 14+，弱链接） ----------
// SCScreenshotManager 单帧捕获指定显示器，排除自身进程全部窗口（Overlay/
// 主窗开着也不入镜）。不引入 SDK 头：其 block 签名含 NSError*（ObjC 类型），
// C++ 编译单元无法解析，故手工声明所用 C 接口——block 参数 NSError* 以
// void* 代（ABI 等价）。全部标记 weak：低版本系统运行时为 NULL，JS 回退
// desktopCapturer。
extern "C" {

typedef struct __SCShareableContent *SCShareableContentRef2;
typedef struct __SCDisplay *SCDisplayRef2;
typedef struct __SCRunningApplication *SCRunningApplicationRef2;
typedef struct __SCContentFilter *SCContentFilterRef2;
typedef struct __SCStreamConfiguration *SCStreamConfigurationRef2;

typedef void (^ShareableContentHandler2)(SCShareableContentRef2, void * /* NSError* */);
typedef void (^CaptureImageHandler2)(CGImageRef, void * /* NSError* */);

__attribute__((weak)) void SCShareableContentGetCurrent(ShareableContentHandler2);
__attribute__((weak)) CFArrayRef SCShareableContentGetDisplays(SCShareableContentRef2);
__attribute__((weak)) uint32_t SCDisplayGetCGDirectDisplayID(SCDisplayRef2);
__attribute__((weak)) SCRunningApplicationRef2 SCRunningApplicationCreateCurrentProcessApplication(void);
__attribute__((weak)) SCContentFilterRef2 SCContentFilterCreateWithDisplayExcludingApplicationsExceptingWindows(
    SCDisplayRef2, CFArrayRef, CFArrayRef);
__attribute__((weak)) SCStreamConfigurationRef2 SCStreamConfigurationCreate(void);
__attribute__((weak)) void SCStreamConfigurationSetWidth(SCStreamConfigurationRef2, size_t);
__attribute__((weak)) void SCStreamConfigurationSetHeight(SCStreamConfigurationRef2, size_t);
__attribute__((weak)) void SCStreamConfigurationSetShowsCursor(SCStreamConfigurationRef2, bool);
__attribute__((weak)) void SCScreenshotManagerCaptureImageWithFilterConfigurationCompletionHandler(
    SCContentFilterRef2, SCStreamConfigurationRef2, CaptureImageHandler2);

}  // extern "C"

namespace {

// SCK 捕获整屏（物理分辨率，排除自身）→ PNG 字节。失败返回 false。
bool SCKCaptureDisplayPNG(uint32_t displayId, std::vector<uint8_t> &out) {
  if (SCShareableContentGetCurrent == NULL ||
      SCShareableContentGetDisplays == NULL ||
      SCDisplayGetCGDirectDisplayID == NULL ||
      SCRunningApplicationCreateCurrentProcessApplication == NULL ||
      SCContentFilterCreateWithDisplayExcludingApplicationsExceptingWindows == NULL ||
      SCStreamConfigurationCreate == NULL ||
      SCScreenshotManagerCaptureImageWithFilterConfigurationCompletionHandler == NULL) {
    return false; // 系统 < macOS 14
  }

  dispatch_semaphore_t sem = dispatch_semaphore_create(0);

  // 1. shareable content（block 内 retain：signal 后主流程仍要使用）
  __block SCShareableContentRef2 content = NULL;
  SCShareableContentGetCurrent(^(SCShareableContentRef2 c, void *err) {
    if (c) CFRetain(c);
    content = c;
    dispatch_semaphore_signal(sem);
  });
  if (dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC)) != 0) return false;
  if (!content) return false;

  // 2. 按 CGDirectDisplayID 匹配目标显示器
  SCDisplayRef2 target = NULL;
  CFArrayRef displays = SCShareableContentGetDisplays(content);
  if (displays) {
    const CFIndex n = CFArrayGetCount(displays);
    for (CFIndex i = 0; i < n; i++) {
      SCDisplayRef2 d = reinterpret_cast<SCDisplayRef2>(
          const_cast<void *>(CFArrayGetValueAtIndex(displays, i)));
      if (d && SCDisplayGetCGDirectDisplayID(d) == displayId) {
        target = d;
        break;
      }
    }
  }
  CFRelease(content);
  if (!target) return false;

  // 3. filter：排除自身进程全部窗口
  SCRunningApplicationRef2 selfApp = SCRunningApplicationCreateCurrentProcessApplication();
  if (!selfApp) return false;
  const void *appsBuf[1] = { selfApp };
  CFArrayRef apps = CFArrayCreate(kCFAllocatorDefault, appsBuf, 1, &kCFTypeArrayCallBacks);
  CFArrayRef noWins = CFArrayCreate(kCFAllocatorDefault, NULL, 0, &kCFTypeArrayCallBacks);
  SCContentFilterRef2 filter =
      SCContentFilterCreateWithDisplayExcludingApplicationsExceptingWindows(target, apps, noWins);
  CFRelease(apps);
  CFRelease(noWins);
  if (!filter) return false;

  // 4. config：物理分辨率、不含鼠标光标
  const size_t pw = static_cast<size_t>(CGDisplayPixelsWide(displayId));
  const size_t ph = static_cast<size_t>(CGDisplayPixelsHigh(displayId));
  SCStreamConfigurationRef2 config = SCStreamConfigurationCreate();
  if (!config) {
    CFRelease(filter);
    return false;
  }
  SCStreamConfigurationSetWidth(config, pw);
  SCStreamConfigurationSetHeight(config, ph);
  if (SCStreamConfigurationSetShowsCursor != NULL) SCStreamConfigurationSetShowsCursor(config, false);

  // 5. 单帧捕获（等待回调，超时 3s）
  __block CGImageRef image = NULL;
  SCScreenshotManagerCaptureImageWithFilterConfigurationCompletionHandler(
      filter, config, ^(CGImageRef img, void *err) {
        if (img) image = reinterpret_cast<CGImageRef>(const_cast<void *>(CFRetain(img)));
        dispatch_semaphore_signal(sem);
      });
  const bool got = dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC)) == 0 &&
                   image != NULL;
  CFRelease(filter);
  CFRelease(config);
  if (!got) return false;

  // 6. CGImage → PNG
  CFMutableDataRef data = CFDataCreateMutable(kCFAllocatorDefault, 0);
  CGImageDestinationRef dest = CGImageDestinationCreateWithData(data, CFSTR("public.png"), 1, NULL);
  bool wrote = false;
  if (dest) {
    CGImageDestinationAddImage(dest, image, NULL);
    wrote = CGImageDestinationFinalize(dest);
    CFRelease(dest);
  }
  CGImageRelease(image);
  if (!wrote) {
    CFRelease(data);
    return false;
  }
  const UInt8 *bytes = CFDataGetBytePtr(data);
  const CFIndex len = CFDataGetLength(data);
  out.assign(bytes, bytes + len);
  CFRelease(data);
  return true;
}

// captureDisplay(displayId): Buffer(PNG) —— 整屏物理分辨率，排除自身进程
Napi::Value CaptureDisplay(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "displayId (number) required").ThrowAsJavaScriptException();
    return env.Null();
  }
  const uint32_t displayId = info[0].As<Napi::Number>().Uint32Value();
  std::vector<uint8_t> png;
  if (!SCKCaptureDisplayPNG(displayId, png)) {
    Napi::Error::New(env, "ScreenCaptureKit capture failed").ThrowAsJavaScriptException();
    return env.Null();
  }
  return Napi::Buffer<uint8_t>::New(env, png.data(), png.size());
}

std::string CFStrToUtf8(CFStringRef ref) {
  if (!ref) return std::string();
  const char *fast = CFStringGetCStringPtr(ref, kCFStringEncodingUTF8);
  if (fast) return std::string(fast);
  CFIndex len = CFStringGetLength(ref);
  CFIndex maxSize = CFStringGetMaximumSizeForEncoding(len, kCFStringEncodingUTF8) + 1;
  std::vector<char> buf(static_cast<size_t>(maxSize));
  if (CFStringGetCString(ref, buf.data(), maxSize, kCFStringEncodingUTF8)) {
    return std::string(buf.data());
  }
  return std::string();
}

// getWindows(): Array<{ windowNumber, pid, x, y, width, height, title, owner }>
// 枚举全部可见普通窗口（不含桌面元素），排除本进程
Napi::Value GetWindows(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Array out = Napi::Array::New(env);

  CFArrayRef list = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID);
  if (!list) return out;

  const int selfPid = static_cast<int>(getpid());
  const CFIndex count = CFArrayGetCount(list);
  uint32_t idx = 0;

  for (CFIndex i = 0; i < count; i++) {
    CFDictionaryRef d =
        reinterpret_cast<CFDictionaryRef>(CFArrayGetValueAtIndex(list, i));
    if (!d || CFGetTypeID(d) != CFDictionaryGetTypeID()) continue;

    // 只要普通窗口层（Dock / 菜单栏 / 悬浮置顶层全部排除）
    int layer = 0;
    CFNumberRef layerRef =
        reinterpret_cast<CFNumberRef>(CFDictionaryGetValue(d, kCGWindowLayer));
    if (layerRef) CFNumberGetValue(layerRef, kCFNumberIntType, &layer);
    if (layer != 0) continue;

    // 排除自身进程（Overlay / 编辑窗不能被拾取到）
    int pid = 0;
    CFNumberRef pidRef =
        reinterpret_cast<CFNumberRef>(CFDictionaryGetValue(d, kCGWindowOwnerPID));
    if (pidRef) CFNumberGetValue(pidRef, kCFNumberIntType, &pid);
    if (pid == selfPid) continue;

    int windowNumber = 0;
    CFNumberRef numRef =
        reinterpret_cast<CFNumberRef>(CFDictionaryGetValue(d, kCGWindowNumber));
    if (numRef) CFNumberGetValue(numRef, kCFNumberIntType, &windowNumber);

    CGRect bounds = CGRectNull;
    CFDictionaryRef bRef =
        reinterpret_cast<CFDictionaryRef>(CFDictionaryGetValue(d, kCGWindowBounds));
    if (!bRef || !CGRectMakeWithDictionaryRepresentation(bRef, &bounds)) continue;
    // 过滤过小窗口（托盘项 / 状态小窗等杂项）
    if (bounds.size.width < 40 || bounds.size.height < 40) continue;

    std::string owner = CFStrToUtf8(
        reinterpret_cast<CFStringRef>(CFDictionaryGetValue(d, kCGWindowOwnerName)));
    std::string title = CFStrToUtf8(
        reinterpret_cast<CFStringRef>(CFDictionaryGetValue(d, kCGWindowName)));

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("windowNumber", Napi::Number::New(env, windowNumber));
    obj.Set("pid", Napi::Number::New(env, pid));
    obj.Set("x", Napi::Number::New(env, bounds.origin.x));
    obj.Set("y", Napi::Number::New(env, bounds.origin.y));
    obj.Set("width", Napi::Number::New(env, bounds.size.width));
    obj.Set("height", Napi::Number::New(env, bounds.size.height));
    obj.Set("title", Napi::String::New(env, title));
    obj.Set("owner", Napi::String::New(env, owner));
    out[idx++] = obj;
  }

  CFRelease(list);
  return out;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("getWindows", Napi::Function::New(env, GetWindows));
  exports.Set("captureDisplay", Napi::Function::New(env, CaptureDisplay));
  return exports;
}

}  // namespace

NODE_API_MODULE(windows, Init)
