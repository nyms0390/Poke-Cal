// Fast OCR pass for the PokéCal turn-log prototype: reads the video directly (AVAssetReader,
// hardware decode), samples it in memory, and runs Apple Vision only where pixels say it's needed.
// Writes the same JSON lines as ocr.swift (one line per sample that got any OCR), plus "choose": true
// on choose-action screens, which parse.mjs uses instead of OCRing the move list. The first line is
// {"profile": "<name>"}: the source profile used.
//
// Usage (compile with `swiftc -O`; run-fast.sh does that — unoptimised, the pixel loops take minutes):
//   fasttrack <video> [--profiles <dir>] [--profile auto|<name>|<path.json>] [--fps 4] [--tight-msg] [--precheck] [--no-ocr] [--debug]   > ocr.jsonl
//   fasttrack --live --window <app or title substring> [--profile auto|<name>] [--fps 4] [--duration s]   > ocr.jsonl  (run-live.sh)
//   fasttrack --live --display [N] [--profile auto|<name>] [--fps 4] [--duration s]   > ocr.jsonl  (whole display, e.g. AirPlay full screen)
//   fasttrack --list-windows | --list-displays
//   fasttrack --learn-choose <framesdir> <labels.txt> [--profile ipad-zh]                        > choose-signature.json
//   fasttrack --learn-choose-video <video> --profile <name> [--from s] [--to s] [--learn-fps 1]   > profiles/<name>.choose.json
// labels.txt: one "<frame.jpg> 0|1" per line (1 = choose screen). --learn-choose-video labels each sample by
// OCRing the profile's choose box and matching its choose.labelRegex. Stats and --debug go to stderr.
// Source profiles (profiles/*.json) hold every box, the OCR languages and the choose detector; --profile auto
// (the default) takes the one whose aspect ratio is closest to the video's.
//
// Gates (boxes in the profile's ref pixels of the game feed, scaled to the video size):
// - msg: text-stroke pixel counts on a 64×8 grid over the message band (the text is drawn straight on
//   the moving 3D scene, white or yellow). Few strokes = no message, no OCR. Otherwise OCR once the
//   grid has settled for `stableSamples` samples (typing done) and differs from the grid last read;
//   if the scene keeps it from settling, read anyway after `msgForce` s.
// - ability/item banners: the same stroke gate on each banner box (broadcast: own side left, opponent right).
// - choose screen: a feature of the profile's choose box, Pearson-correlated with the learned template.
//   iPad ("gradient"): vertical-gradient profile of the move-list panel, learned from the 2 fps frames.
//   Broadcast ("strokes"): text-stroke grid of the fixed "Trainers are choosing actions" line (the
//   spectator view has no move list), learned from the video itself. On choose screens: the 4 plates
//   (2× and 1×), 4 HP boxes (digits pass) and the field banner if the profile has one, from the 2nd
//   choose sample of a run, at most `plateReadsPerRun` times per run.
// - team preview (only before the first choose screen, if the profile has one): name and own list on a
//   32×8 grayscale thumbnail, OCR when settled and changed.
import Foundation
import Vision
import CoreGraphics
import ImageIO
import AVFoundation
import ScreenCaptureKit
import AppKit

// ---------- source profile (profiles/*.json): boxes, OCR languages, choose-screen detector ----------
// Boxes are x,y,w,h in the profile's `ref` pixels of the game feed; `feed` is the game feed's rectangle in
// the video frame as fractions (x,y,w,h), so a broadcast that shows the game inset still maps.
struct Box { let x, y, w, h: Int }
struct Profile {
    let name: String, dir: String, aspect: Double, refW: Double, refH: Double, feed: [Double], ocrLanguages: [String]
    let msg: Box, msgTight: Box, msgText: Box, msgEmpty: Double, field: Box?
    let chooseKind: String, chooseBox: Box, signature: String, labelRegex: String?
    let banners: [(String, Box)], bannerEmpty: Double, previewName: Box?, previewOwn: Box?
    let plates: [(String, Box, Bool)]
}
func loadProfile(_ path: String) -> Profile? {
    guard let d = FileManager.default.contents(atPath: path), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return nil }
    func box(_ v: Any?) -> Box? { (v as? [Double]).flatMap { $0.count == 4 ? Box(x: Int($0[0]), y: Int($0[1]), w: Int($0[2]), h: Int($0[3])) : nil } }
    let ref = j["ref"] as? [Double] ?? [2360, 1640], ch = j["choose"] as? [String: Any] ?? [:]
    let pv = j["preview"] as? [String: Any]
    let pl = (j["plates"] as? [String: Any] ?? [:]).sorted { $0.key < $1.key }.compactMap { k, v in box(v).map { (k, $0, k.hasSuffix("_hp")) } }
    return Profile(name: j["name"] as? String ?? path, dir: (path as NSString).deletingLastPathComponent, aspect: j["aspect"] as? Double ?? ref[0] / ref[1],
                   refW: ref[0], refH: ref[1], feed: j["feed"] as? [Double] ?? [0, 0, 1, 1], ocrLanguages: j["ocrLanguages"] as? [String] ?? ["en-US"],
                   msg: box(j["msg"])!, msgTight: box(j["msgTight"]) ?? box(j["msg"])!, msgText: box(j["msgText"])!, msgEmpty: j["msgEmpty"] as? Double ?? 100,
                   field: box(j["field"]), chooseKind: ch["kind"] as? String ?? "gradient", chooseBox: box(ch["box"])!,
                   signature: ch["signature"] as? String ?? "", labelRegex: ch["labelRegex"] as? String,
                   banners: (j["banners"] as? [[String: Any]] ?? []).compactMap { b in box(b["box"]).map { (b["name"] as? String ?? "ability", $0) } },
                   bannerEmpty: j["bannerEmpty"] as? Double ?? 300, previewName: box(pv?["name"]), previewOwn: box(pv?["own"]), plates: pl)
}
var P: Profile! = nil

let plateNames: Set<String> = ["opp_left", "opp_right", "you_left", "you_right"]

// ---------- pixel access ----------
// BGRA bytes, top-left origin. sx/sy map the profile's ref coordinates (inside the feed rectangle) to this frame.
// Live capture sets the content rect (cx, cy, cw, ch): the game picture inside the window, without letterbox
// borders or a title bar. Video files use the whole frame.
struct Frame {
    let base: UnsafePointer<UInt8>; let bpr: Int; let width: Int; let height: Int
    var cx = 0, cy = 0, cw = 0, ch = 0
    var contentW: Double { Double(cw > 0 ? cw : width) }
    var contentH: Double { Double(ch > 0 ? ch : height) }
    var sx: Double { contentW * P.feed[2] / P.refW }
    var sy: Double { contentH * P.feed[3] / P.refH }
    func rect(_ b: Box) -> (Int, Int, Int, Int) {
        (cx + Int(contentW * P.feed[0] + Double(b.x) * sx), cy + Int(contentH * P.feed[1] + Double(b.y) * sy), max(1, Int(Double(b.w) * sx)), max(1, Int(Double(b.h) * sy)))
    }
    @inline(__always) func px(_ x: Int, _ y: Int) -> (Int, Int, Int) {
        let p = base + y * bpr + x * 4
        return (Int(p[2]), Int(p[1]), Int(p[0]))
    }
}

// Per-cell mean of f(pixel) over a gw×gh grid, sampling every `step` pixels.
func grid(_ f: Frame, _ b: Box, _ gw: Int, _ gh: Int, step: Int = 2, _ value: (Int, Int, Int) -> [Double]) -> [Double] {
    let (x0, y0, w, h) = f.rect(b)
    var dims = 0
    var acc: [Double] = []
    var n = [Double](repeating: 0, count: gw * gh)
    var y = 0
    while y < h {
        let cy = min(gh - 1, y * gh / h)
        var x = 0
        while x < w {
            let cx = min(gw - 1, x * gw / w)
            let (r, g, bl) = f.px(min(f.width - 1, x0 + x), min(f.height - 1, y0 + y))
            let v = value(r, g, bl)
            if dims == 0 { dims = v.count; acc = [Double](repeating: 0, count: gw * gh * dims) }
            let c = cy * gw + cx
            for k in 0..<dims { acc[c * dims + k] += v[k] }
            n[c] += 1
            x += step
        }
        y += step
    }
    for c in 0..<(gw * gh) where n[c] > 0 { for k in 0..<dims { acc[c * dims + k] /= n[c] } }
    return acc
}
// Text strokes: bright pixels (any hue: messages are white, crits yellow) with a much darker pixel
// 4 px above or below, i.e. thin glyph strokes over the darkened scene or a banner. Counted on a grid.
func textGrid(_ f: Frame, _ b: Box, _ gw: Int, _ gh: Int) -> [Double] {
    let (x0, y0, w, h) = f.rect(b)
    let off = max(2, Int(4 * f.sy))
    var acc = [Double](repeating: 0, count: gw * gh)
    var y = 0
    while y < h {
        let yy = y0 + y, cy = y * gh / h
        if yy - off >= 0 && yy + off < f.height {
            var x = 0
            while x < w {
                let xx = x0 + x
                let (r, g, bl) = f.px(xx, yy)
                let hi = max(r, g, bl)
                if hi > 170 {
                    let (ur, ug, ub) = f.px(xx, yy - off), (dr, dg, db) = f.px(xx, yy + off)
                    if max(ur, ug, ub) < hi - 80 || max(dr, dg, db) < hi - 80 { acc[cy * gw + x * gw / w] += 1 }
                }
                x += 2
            }
        }
        y += 2
    }
    return acc
}
// Read a text region once its stroke grid has settled (typing done) and differs from the grid last
// read; if the scene behind keeps it from settling, read anyway after `force` s without a read.
struct TextGate {
    let empty: Double, force: Double
    var prev: [Double] = [], stable = 0, last: [Double]? = nil, lastT = -Double.infinity
    var total = 0.0, d = 0.0
    mutating func update(_ g: [Double], _ t: Double, allowed: Bool) -> String {
        total = g.reduce(0, +)
        d = prev.isEmpty ? 1 : relDiff(g, prev)
        stable = d < 0.25 ? stable + 1 : 0
        prev = g
        if total < empty || !allowed { last = nil; return "" }
        let changed = last == nil || relDiff(g, last!) > 0.3
        let reason = !changed ? "" : stable >= stableSamples ? "stable" : t - lastT >= force ? "force" : ""
        if !reason.isEmpty { last = g; lastT = t }
        return reason
    }
}
func grayThumb(_ f: Frame, _ b: Box) -> [Double] { grid(f, b, 32, 8, step: 3) { r, g, b in [Double(r + g + b) / 3] } }
// Vertical-gradient profile of the move panel (4 columns × 40 rows): the button outlines sit at
// fixed rows whatever their colour (highlighted, greyed out) or the scene behind them.
func panelSignature(_ f: Frame) -> [Double] {
    let (x0, y0, w, h) = f.rect(P.chooseBox)
    let gw = 2, gh = 150
    var acc = [Double](repeating: 0, count: gw * gh), n = [Double](repeating: 0, count: gw * gh)
    let dy = max(1, Int(2 * f.sy))
    @inline(__always) func gray(_ x: Int, _ y: Int) -> Int { let (r, g, b) = f.px(x, y); return r + g + b }
    var y = 0
    while y + dy < h {
        let cy = y * gh / h
        var x = 0
        while x < w {
            let c = cy * gw + x * gw / w
            acc[c] += Double(abs(gray(x0 + x, y0 + y + dy) - gray(x0 + x, y0 + y))) / 3
            n[c] += 1
            x += 3
        }
        y += 1
    }
    return (0..<acc.count).map { acc[$0] / max(1, n[$0]) }
}
// The profile's choose-screen feature: "gradient" = panelSignature of the move panel (iPad);
// "strokes" = text-stroke grid of a fixed line such as "Trainers are choosing actions" (broadcast).
func chooseFeature(_ f: Frame) -> [Double] { P.chooseKind == "strokes" ? textGrid(f, P.chooseBox, 32, 4) : panelSignature(f) }
func meanAbs(_ a: [Double], _ b: [Double]) -> Double {
    guard a.count == b.count, !a.isEmpty else { return .infinity }
    var s = 0.0
    for i in 0..<a.count { s += abs(a[i] - b[i]) }
    return s / Double(a.count)
}
func pearson(_ a: [Double], _ b: [Double]) -> Double {
    let n = Double(a.count)
    let ma = a.reduce(0, +) / n, mb = b.reduce(0, +) / n
    var sab = 0.0, saa = 0.0, sbb = 0.0
    for i in 0..<a.count { let x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y }
    return sab / max(1e-9, (saa * sbb).squareRoot())
}
// Relative change between two stroke grids: changed counts over the larger total.
func relDiff(_ a: [Double], _ b: [Double]) -> Double {
    guard a.count == b.count else { return 1 }
    var d = 0.0, ta = 0.0, tb = 0.0
    for i in 0..<a.count { d += abs(a[i] - b[i]); ta += a[i]; tb += b[i] }
    return d / max(ta, tb, 1e-9)
}

// ---------- OCR (same as ocr.swift) ----------
let ocrCalls = ManagedAtomicCounter()
final class ManagedAtomicCounter { private var n = 0; private let l = NSLock(); func add(_ k: Int = 1) { l.lock(); n += k; l.unlock() }; var value: Int { l.lock(); defer { l.unlock() }; return n } }
let fastCalls = ManagedAtomicCounter()

func crop(_ img: CGImage, _ r: (Int, Int, Int, Int), scale: Int = 2) -> CGImage? {
    guard let c = img.cropping(to: CGRect(x: r.0, y: r.1, width: r.2, height: r.3)) else { return nil }
    let w = c.width * scale, h = c.height * scale
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    ctx.interpolationQuality = .high
    ctx.draw(c, in: CGRect(x: 0, y: 0, width: w, height: h))
    return ctx.makeImage()
}
func ocr(_ img: CGImage, digits: Bool, fast: Bool = false) -> [[String: Any]] {
    (fast ? fastCalls : ocrCalls).add()
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = fast ? .fast : .accurate
    req.recognitionLanguages = digits ? ["en-US"] : P.ocrLanguages
    req.usesLanguageCorrection = !digits && !fast
    do { try VNImageRequestHandler(cgImage: img, options: [:]).perform([req]) } catch { return [] }
    return (req.results ?? [])
        .sorted { $0.boundingBox.minY > $1.boundingBox.minY }
        .compactMap { o in
            guard let top = o.topCandidates(1).first else { return nil }
            return ["text": top.string, "conf": (Double(top.confidence) * 100).rounded() / 100,
                    "y": (Double(1 - o.boundingBox.midY) * 100).rounded() / 100,
                    "x": (Double(o.boundingBox.minX) * 100).rounded() / 100]
        }
}

func fail(_ s: String) -> Never { FileHandle.standardError.write((s + "\n").data(using: .utf8)!); exit(1) }
func log(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }
func bgraContext(_ w: Int, _ h: Int, data: UnsafeMutableRawPointer? = nil, bpr: Int = 0) -> CGContext? {
    CGContext(data: data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: bpr, space: CGColorSpaceCreateDeviceRGB(),
              bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
}

var args = Array(CommandLine.arguments.dropFirst())
let here = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().path
func opt(_ k: String) -> String? { args.firstIndex(of: k).flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil } }

// ---------- profile ----------
// --profile <name|path.json|auto> (default auto: the profile in --profiles <dir> whose aspect ratio is
// closest to the video's; --learn-choose defaults to ipad-zh). --signature overrides the profile's.
let profilesDir = opt("--profiles") ?? "\(here)/profiles"
func profileNamed(_ s: String) -> Profile {
    let path = s.hasSuffix(".json") ? s : "\(profilesDir)/\(s).json"
    guard let p = loadProfile(path) else { fail("can't read profile \(path)") }
    return p
}
func allProfiles() -> [Profile] {
    ((try? FileManager.default.contentsOfDirectory(atPath: profilesDir)) ?? []).filter { $0.hasSuffix(".json") && !$0.contains(".choose.") }
        .compactMap { loadProfile("\(profilesDir)/\($0)") }
}
func autoProfile(aspect: Double) -> Profile {
    let all = allProfiles()
    guard let best = all.min(by: { abs($0.aspect - aspect) < abs($1.aspect - aspect) }) else { fail("no profiles in \(profilesDir)") }
    return best
}
func signaturePath() -> String { opt("--signature") ?? (P.signature.hasPrefix("/") ? P.signature : "\(P.dir)/\(P.signature)") }

// Template = mean choose feature; score = Pearson correlation with it (ignores brightness and contrast).
// The strokes detector also needs enough stroke pixels (minTotal), since an empty box correlates with noise.
func learnTemplate(_ pos: [[Double]], _ neg: [[Double]], names: (pos: [String], neg: [String])) -> [String: Any] {
    guard !pos.isEmpty, !neg.isEmpty else { fail("need both choose and other frames") }
    let k = pos[0].count
    var mean = [Double](repeating: 0, count: k)
    for x in pos { for i in 0..<k { mean[i] += x[i] / Double(pos.count) } }
    let minTotal = P.chooseKind == "strokes" ? (pos.map { $0.reduce(0, +) }.min()! * 0.5).rounded() : 0
    // Others below minTotal are rejected before the correlation, so they don't set the threshold.
    let sp = pos.map { pearson($0, mean) }, sn = neg.map { $0.reduce(0, +) >= minTotal ? pearson($0, mean) : 0 }
    let minPos = sp.min()!, maxNeg = sn.max()!
    let threshold = (minPos + maxNeg) / 2
    log(String(format: "choose %d frames: min r %.3f; others %d: max r %.3f; threshold %.3f; min strokes %.0f", pos.count, minPos, neg.count, maxNeg, threshold, minTotal))
    for (l, v) in zip(names.neg, sn) where v > minPos - 0.05 { log("close other: \(l) \(String(format: "%.3f", v))") }
    for (l, v) in zip(names.pos, sp) where v < maxNeg + 0.05 { log("weak choose: \(l) \(String(format: "%.3f", v))") }
    let b = P.chooseBox
    return ["profile": "\(P.chooseKind) feature of \(P.name) box \(b.x),\(b.y),\(b.w),\(b.h)", "threshold": (threshold * 1000).rounded() / 1000,
            "minChoose": (minPos * 1000).rounded() / 1000, "maxOther": (maxNeg * 1000).rounded() / 1000, "minTotal": minTotal,
            "chooseFrames": pos.count, "otherFrames": neg.count, "mean": mean.map { ($0 * 10).rounded() / 10 }]
}
func printJSON(_ obj: [String: Any]) { print(String(data: try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]), encoding: .utf8)!) }

// ---------- learn mode (frames + labels) ----------
if args.first == "--learn-choose" {
    guard args.count >= 3 else { fail("usage: --learn-choose <framesdir> <labels.txt> [--profile ipad-zh]") }
    P = profileNamed(opt("--profile") ?? "ipad-zh")
    let dir = args[1]
    let labels = try! String(contentsOfFile: args[2], encoding: .utf8).split(separator: "\n").map { $0.split(separator: " ") }
    var pos: [[Double]] = [], neg: [[Double]] = [], names: (pos: [String], neg: [String]) = ([], [])
    for l in labels where l.count == 2 {
        guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: "\(dir)/\(l[0])") as CFURL, nil),
              let img = CGImageSourceCreateImageAtIndex(src, 0, nil), let ctx = bgraContext(img.width, img.height) else { continue }
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: img.width, height: img.height))
        let f = Frame(base: UnsafePointer(ctx.data!.assumingMemoryBound(to: UInt8.self)), bpr: ctx.bytesPerRow, width: img.width, height: img.height)
        if l[1] == "1" { pos.append(chooseFeature(f)); names.pos.append(String(l[0])) } else { neg.append(chooseFeature(f)); names.neg.append(String(l[0])) }
    }
    printJSON(learnTemplate(pos, neg, names: names))
    exit(0)
}

// ---------- decode ----------
// Calls body(frame, t) for each sample on a k / fps grid (the sampling-grid time, like ffmpeg's fps filter,
// not the frame's own pts). Returns the number of decoded frames.
var assets: [AVAsset] = []   // AVAssetTrack.asset is weak: keep the asset alive
func loadTrack(_ path: String) -> AVAssetTrack {
    let asset = AVURLAsset(url: URL(fileURLWithPath: path))
    assets.append(asset)
    let sema = DispatchSemaphore(value: 0)
    var track: AVAssetTrack?
    Task { track = try? await asset.loadTracks(withMediaType: .video).first; sema.signal() }
    sema.wait()
    guard let track else { fail("no video track in \(path)") }
    return track
}
func trackAspect(_ track: AVAssetTrack) -> Double {
    let sema = DispatchSemaphore(value: 0)
    var size = CGSize(width: 16, height: 9)
    Task { if let s = try? await track.load(.naturalSize) { size = s }; sema.signal() }
    sema.wait()
    return Double(size.width) / Double(size.height)
}
func decode(_ track: AVAssetTrack, fps: Double, _ body: (Frame, Double) -> Void) -> Int {
    let reader = try! AVAssetReader(asset: track.asset!)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    output.alwaysCopiesSampleData = false
    reader.add(output)
    reader.startReading()
    var nextT = 0.0, decoded = 0
    while let sb = output.copyNextSampleBuffer() {
        decoded += 1
        let pts = CMSampleBufferGetPresentationTimeStamp(sb).seconds
        guard pts + 1e-6 >= nextT, let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
        let t = ((pts + 1e-6) * fps).rounded(.down) / fps
        nextT = t + 1 / fps
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        body(Frame(base: CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self), bpr: CVPixelBufferGetBytesPerRow(pb),
                   width: CVPixelBufferGetWidth(pb), height: CVPixelBufferGetHeight(pb)), t)
        CVPixelBufferUnlockBaseAddress(pb, .readOnly)
    }
    if reader.status == .failed { fail("decode failed: \(reader.error?.localizedDescription ?? "?")") }
    return decoded
}
func frameImage(_ f: Frame) -> CGImage? {
    bgraContext(f.width, f.height, data: UnsafeMutableRawPointer(mutating: f.base), bpr: f.bpr)?.makeImage()
}

// ---------- learn mode (video, labels from OCR of the choose box) ----------
// fasttrack --learn-choose-video <video> [--profile broadcast-en] [--from s] [--to s] [--learn-fps 1]
// Labels each sample by OCRing the profile's choose box and matching choose.labelRegex.
if args.first == "--learn-choose-video" {
    guard args.count >= 2 else { fail("usage: --learn-choose-video <video> [--profile p] [--from s] [--to s] [--learn-fps 1]") }
    let track = loadTrack(args[1])
    P = opt("--profile").map(profileNamed) ?? autoProfile(aspect: trackAspect(track))
    guard let rx = P.labelRegex.flatMap({ try? NSRegularExpression(pattern: $0, options: [.caseInsensitive]) }) else { fail("profile \(P.name) has no choose.labelRegex") }
    let from = Double(opt("--from") ?? "0") ?? 0, to = Double(opt("--to") ?? "1e9") ?? 1e9
    var pos: [[Double]] = [], neg: [[Double]] = [], names: (pos: [String], neg: [String]) = ([], [])
    _ = decode(track, fps: Double(opt("--learn-fps") ?? "1") ?? 1) { f, t in
        guard t >= from && t <= to, let img = frameImage(f), let c = crop(img, f.rect(P.chooseBox)) else { return }
        let text = ocr(c, digits: false).compactMap { $0["text"] as? String }.joined(separator: " ")
        let yes = rx.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
        let name = String(format: "t=%.2f", t)
        if yes { pos.append(chooseFeature(f)); names.pos.append(name) } else { neg.append(chooseFeature(f)); names.neg.append(name) }
    }
    printJSON(learnTemplate(pos, neg, names: names))
    exit(0)
}

// ---------- live capture (ScreenCaptureKit) ----------
// fasttrack --list-windows | --list-displays
// fasttrack --live --window <app or title substring> | --window-id <id> | --display [N] [--profile auto|name] [--fps 4] [--duration s] [--content-png file]
// One window is captured with SCContentFilter(desktopIndependentWindow:), so it works behind other windows.
// The game picture inside it is the non-black bounding box (letterbox borders, a title bar over black are
// cut off), grown as brighter scenes show more of it. The stream is then rescaled so the picture is the
// profile's ref width, so the stroke thresholds learned on recordings hold. Lines are printed as soon as
// every earlier sample's OCR is done. Stops on SIGINT/SIGTERM, after --duration, or when the window goes away.
// --display [N] captures a whole display instead (N from --list-displays, default the main display), for
// AirPlay mirroring, which runs full screen. The game picture is the non-black box, accepted only once it
// is letterboxed (black border on two sides), has a profile's aspect ratio and holds still for 2 s; until
// then (the desktop before mirroring starts) nothing is parsed and there is no timeout (--duration still
// caps the run). If the border stops being black later (mirroring stopped), sampling pauses until the
// picture is back; a new picture of the same aspect elsewhere or at another size is taken over.
func permissionFail() -> Never {
    fail("""
    Screen Recording permission is not granted to this terminal app.
    Open System Settings → Privacy & Security → Screen & System Audio Recording, enable the app you run
    this from (Terminal, iTerm, Claude, …), quit and reopen that app, then run this again.
    """)
}
func shareableContent() -> SCShareableContent {
    // CGRequestScreenCaptureAccess adds the app to the Screen Recording list (and may show the system prompt).
    if !CGPreflightScreenCaptureAccess() { _ = CGRequestScreenCaptureAccess(); permissionFail() }
    let sema = DispatchSemaphore(value: 0)
    var content: SCShareableContent?, err: Error?
    SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { c, e in content = c; err = e; sema.signal() }
    sema.wait()
    guard let content else {
        if let e = err as NSError?, e.domain == SCStreamErrorDomain, e.code == SCStreamError.Code.userDeclined.rawValue { permissionFail() }
        fail("can't list windows: \(err?.localizedDescription ?? "?")")
    }
    return content
}
func capturableWindows(_ c: SCShareableContent) -> [SCWindow] {
    c.windows.filter { $0.windowLayer == 0 && $0.frame.width >= 200 && $0.frame.height >= 150 && $0.owningApplication != nil }
        .sorted { $0.frame.width * $0.frame.height > $1.frame.width * $1.frame.height }
}
if args.first == "--list-windows" {
    for w in capturableWindows(shareableContent()) {
        print(String(format: "%6d  %-24@  %-40@  %4.0f×%-4.0f", w.windowID, (w.owningApplication?.applicationName ?? "?") as NSString,
                     (w.title ?? "") as NSString, w.frame.width, w.frame.height))
    }
    exit(0)
}
// Displays in --display order: the main display is 1, then left to right.
func orderedDisplays(_ c: SCShareableContent) -> [SCDisplay] {
    c.displays.sorted { ($0.displayID == CGMainDisplayID() ? 0 : 1, $0.frame.minX) < ($1.displayID == CGMainDisplayID() ? 0 : 1, $1.frame.minX) }
}
if args.first == "--list-displays" {
    for (i, d) in orderedDisplays(shareableContent()).enumerated() {
        print(String(format: "%3d  id %-10u  %4d×%-4d points%@", i + 1, d.displayID, d.width, d.height, d.displayID == CGMainDisplayID() ? "  (main)" : ""))
    }
    exit(0)
}

// Non-black bounding box of a frame as fractions (x0, y0, x1, y1): rows/columns with at least 1% bright pixels.
func nonBlackBox(_ f: Frame) -> (Double, Double, Double, Double)? {
    let step = max(2, f.width / 600)
    let nx = f.width / step, ny = f.height / step
    var rows = [Int](repeating: 0, count: ny), cols = [Int](repeating: 0, count: nx)
    for j in 0..<ny { for i in 0..<nx { let (r, g, b) = f.px(i * step, j * step); if max(r, g, b) > 40 { rows[j] += 1; cols[i] += 1 } } }
    guard let y0 = rows.firstIndex(where: { $0 >= max(2, nx / 100) }), let y1 = rows.lastIndex(where: { $0 >= max(2, nx / 100) }),
          let x0 = cols.firstIndex(where: { $0 >= max(2, ny / 100) }), let x1 = cols.lastIndex(where: { $0 >= max(2, ny / 100) }) else { return nil }
    return (Double(x0) / Double(nx), Double(y0) / Double(ny), Double(x1 + 1) / Double(nx), Double(y1 + 1) / Double(ny))
}
final class Grabber: NSObject, SCStreamOutput, SCStreamDelegate {
    let lock = NSLock()
    var latest: CVPixelBuffer?, received = 0, stopError: String?
    let onStop: () -> Void
    init(onStop: @escaping () -> Void) { self.onStop = onStop }
    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        // Only complete frames carry pixels; idle frames (nothing changed) keep the last one.
        guard type == .screen, sb.isValid,
              let att = (CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]])?.first,
              let raw = att[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete,
              let pb = CMSampleBufferGetImageBuffer(sb) else { return }
        lock.lock(); latest = pb; received += 1; lock.unlock()
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        lock.lock(); stopError = error.localizedDescription; lock.unlock()
        onStop()
    }
    func take() -> CVPixelBuffer? { lock.lock(); defer { lock.unlock() }; return latest }
}
func withFrame<T>(_ pb: CVPixelBuffer, _ body: (Frame) -> T) -> T {
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
    return body(Frame(base: CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self), bpr: CVPixelBufferGetBytesPerRow(pb),
                      width: CVPixelBufferGetWidth(pb), height: CVPixelBufferGetHeight(pb)))
}
func waitAsync(_ what: String, _ body: (@escaping (Error?) -> Void) -> Void) {
    let sema = DispatchSemaphore(value: 0)
    var err: Error?
    body { e in err = e; sema.signal() }
    sema.wait()
    if let e = err as NSError? {
        if e.domain == SCStreamErrorDomain && e.code == SCStreamError.Code.userDeclined.rawValue { permissionFail() }
        fail("\(what) failed: \(e.localizedDescription)")
    }
}

// ---------- options ----------
let live = args.first == "--live"
let fps = Double(opt("--fps") ?? "4") ?? 4
let stopSema = DispatchSemaphore(value: 0)
var track: AVAssetTrack?, videoPath = ""
var stream: SCStream?, grabber: Grabber?
var liveSize = (0, 0), liveContent = (0.0, 0.0, 1.0, 1.0), liveStart = Date(), liveWindow = ""
let displayMode = live && args.contains("--display")
let programStart = Date(), duration = opt("--duration").flatMap(Double.init)
var liveNative = (0, 0), liveCfg: SCStreamConfiguration?, livePaused = false
// --display: a letterboxed picture (black on both sides or top and bottom) of one of these aspect ratios.
let pictureAspects: [Double] = !displayMode ? [] : opt("--profile").flatMap { $0 == "auto" ? nil : [profileNamed($0).aspect] } ?? allProfiles().map(\.aspect)
func pictureAspect(_ b: (Double, Double, Double, Double), _ w: Int, _ h: Int) -> Double { (b.2 - b.0) * Double(w) / ((b.3 - b.1) * Double(h)) }
func gamePicture(_ b: (Double, Double, Double, Double)?, _ w: Int, _ h: Int, aspects: [Double]) -> Bool {
    guard let b else { return false }
    let bordered = b.2 - b.0 < 0.97 || b.3 - b.1 < 0.97
    let a = pictureAspect(b, w, h)
    return bordered && (b.2 - b.0) * (b.3 - b.1) >= 0.3 && aspects.contains { abs($0 - a) < 0.04 }
}
func sameBox(_ a: (Double, Double, Double, Double), _ b: (Double, Double, Double, Double), tol: Double = 0.01) -> Bool {
    abs(a.0 - b.0) < tol && abs(a.1 - b.1) < tol && abs(a.2 - b.2) < tol && abs(a.3 - b.3) < tol
}
func describeBox(_ b: (Double, Double, Double, Double)?, _ w: Int, _ h: Int) -> String {
    guard let b else { return "all black" }
    return String(format: "non-black box x %.2f–%.2f, y %.2f–%.2f, aspect %.3f", b.0, b.2, b.1, b.3, pictureAspect(b, w, h))
}
// Stream size that makes the picture the profile's ref width.
func streamSize(_ b: (Double, Double, Double, Double)) -> (Int, Int, Double) {
    let k = min(P.refW / ((b.2 - b.0) * Double(liveNative.0)), 8192 / Double(max(liveNative.0, liveNative.1)))
    return (Int(Double(liveNative.0) * k) & ~1, Int(Double(liveNative.1) * k) & ~1, k)
}
if live {
    _ = NSApplication.shared   // SCStream needs a CoreGraphics session (else CGS_REQUIRE_INIT asserts)
    let content = shareableContent()
    let windows = capturableWindows(content)
    let window: SCWindow
    let filter: SCContentFilter
    var idNote = ""
    if displayMode {
        let displays = orderedDisplays(content)
        let n = opt("--display").flatMap(Int.init) ?? 1
        guard n >= 1 && n <= displays.count else { fail("no display \(n) (see --list-displays)") }
        let d = displays[n - 1]
        // Notification banners would break the black border; leave them out of the capture.
        let hidden = content.applications.filter { $0.bundleIdentifier == "com.apple.notificationcenterui" }
        filter = SCContentFilter(display: d, excludingApplications: hidden, exceptingWindows: [])
        liveWindow = "display \(n) (id \(d.displayID), \(d.width)×\(d.height) points)"
    } else {
    if let id = opt("--window-id").flatMap(UInt32.init) {
        guard let w = windows.first(where: { $0.windowID == id }) else { fail("no capturable window with id \(id) (see --list-windows)") }
        window = w
    } else if let q = opt("--window")?.lowercased() {
        guard let w = windows.first(where: { ($0.owningApplication?.applicationName.lowercased().contains(q) ?? false) || ($0.title?.lowercased().contains(q) ?? false) })
        else { fail("no capturable window matches \"\(q)\" (see --list-windows; minimised windows can't be captured)") }
        window = w
    } else { fail("usage: fasttrack --live --window <app or title substring> | --window-id <id> | --display [N] [--profile auto|name] [--fps 4] [--duration s]") }
    liveWindow = "\(window.owningApplication?.applicationName ?? "?") — \(window.title ?? "")"
    filter = SCContentFilter(desktopIndependentWindow: window)
    idNote = " (id \(window.windowID))"
    }
    let native = (Int(filter.contentRect.width * CGFloat(filter.pointPixelScale)) & ~1, Int(filter.contentRect.height * CGFloat(filter.pointPixelScale)) & ~1)
    let cfg = SCStreamConfiguration()
    cfg.width = native.0; cfg.height = native.1
    cfg.pixelFormat = kCVPixelFormatType_32BGRA
    cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(max(1, fps * 2)))
    cfg.queueDepth = 6
    cfg.showsCursor = false
    cfg.scalesToFit = true   // else a larger output size draws the window 1:1 in the corner
    cfg.capturesAudio = false
    let g = Grabber { stopSema.signal() }
    let s = SCStream(filter: filter, configuration: cfg, delegate: g)
    try! s.addStreamOutput(g, type: .screen, sampleHandlerQueue: DispatchQueue(label: "capture"))
    waitAsync("start capture") { done in s.startCapture { done($0) } }
    stream = s; grabber = g
    log("live: capturing \(liveWindow)\(idNote) at \(native.0)×\(native.1)")
    liveNative = native; liveCfg = cfg
    var box: (Double, Double, Double, Double)?
    let waitStart = Date()
    if displayMode {
        // Wait (no timeout) for a letterboxed picture of a profile's aspect that holds still for 2 s.
        var last: (Double, Double, Double, Double)?, stableN = 0, lastWaitLog = -Double.infinity
        while box == nil {
            if let d = duration, Date().timeIntervalSince(programStart) >= d { fail("live: no game picture on the display within --duration \(Int(d)) s") }
            Thread.sleep(forTimeInterval: 0.5)
            if getppid() == 1 { exit(0) }   // live.mjs / the terminal went away (signals still have their default action here)
            guard let pb = g.take() else { continue }
            let (b, w, h) = withFrame(pb) { (nonBlackBox($0), $0.width, $0.height) }
            if gamePicture(b, w, h, aspects: pictureAspects) {
                stableN = last.map { sameBox($0, b!) } == true ? stableN + 1 : 1
                last = b
                if stableN >= 4 { box = b }
            } else { stableN = 0; last = nil }
            let waited = Date().timeIntervalSince(waitStart)
            if box == nil && waited - lastWaitLog >= 30 {
                lastWaitLog = waited
                log("live: waiting for game picture… (\(Int(waited)) s; screen: \(describeBox(b, w, h)))")
            }
        }
    } else {
        // The picture: wait for a frame whose non-black box covers at least 30% of the window (not a black
        // loading screen), then pick the profile by its aspect ratio and rescale the stream to the ref width.
        while box == nil {
            if Date().timeIntervalSince(waitStart) > 30 { fail("live: no picture in the window after 30 s (is the video playing / the iPad mirrored?)") }
            Thread.sleep(forTimeInterval: 0.25)
            guard let pb = g.take() else { continue }
            if let b = withFrame(pb, nonBlackBox), (b.2 - b.0) * (b.3 - b.1) >= 0.3 { box = b }
        }
    }
    liveContent = box!
    let cwPx = (liveContent.2 - liveContent.0) * Double(native.0), chPx = (liveContent.3 - liveContent.1) * Double(native.1)
    P = opt("--profile").flatMap { $0 == "auto" ? nil : profileNamed($0) } ?? autoProfile(aspect: cwPx / chPx)
    let (sw, sh, k) = streamSize(liveContent)
    liveSize = (sw, sh)
    cfg.width = liveSize.0; cfg.height = liveSize.1
    waitAsync("resize capture") { done in s.updateConfiguration(cfg) { done($0) } }
    log(String(format: "live: picture %.0f×%.0f at (%.0f, %.0f) in the capture (aspect %.3f) → profile %@; stream rescaled ×%.2f to %d×%d",
               cwPx, chPx, liveContent.0 * Double(native.0), liveContent.1 * Double(native.1), cwPx / chPx, P.name, k, liveSize.0, liveSize.1))
} else {
    guard let v = args.first, !v.hasPrefix("--") else { fail("usage: fasttrack <video> [--profile auto|name|path] [--fps 4] [--tight-msg] [--precheck] [--no-ocr] [--debug]") }
    videoPath = v
    track = loadTrack(videoPath)
    P = opt("--profile").flatMap { $0 == "auto" ? nil : profileNamed($0) } ?? autoProfile(aspect: trackAspect(track!))
}
log("fasttrack: profile \(P.name)")
let precheck = args.contains("--precheck")   // VNRecognizeTextRequest .fast before each msg read (it can't read Chinese: hurts)
let noOcr = args.contains("--no-ocr")   // measure decode + features only
// --tight-msg: OCR only the band the message lines use (msgText padded), ~45% of the msg pixels on iPad.
let msgCrop = args.contains("--tight-msg") ? P.msgTight : P.msg
let debug = args.contains("--debug")
let stableSamples = Int(opt("--stable") ?? "1") ?? 1   // consecutive unchanged samples before a read
let msgEmpty = Double(opt("--msg-empty") ?? "") ?? P.msgEmpty   // stroke pixels (every 2nd px) below which there's no message
let msgForce = Double(opt("--msg-force") ?? "1.5") ?? 1.5
let plateReadsPerRun = Int(opt("--plate-reads") ?? "3") ?? 3   // per run of choose samples (votes for the italic names)
let plateGap = Double(opt("--plate-gap") ?? "0") ?? 0
let sigPath = signaturePath()
guard let sigData = FileManager.default.contents(atPath: sigPath),
      let sig = try? JSONSerialization.jsonObject(with: sigData) as? [String: Any],
      let chooseMean = sig["mean"] as? [Double], let chooseThreshold = sig["threshold"] as? Double else { fail("missing \(sigPath)") }
let chooseMinTotal = sig["minTotal"] as? Double ?? 0

// OCR jobs run concurrently; results are keyed by sample index.
let ocrQueue = DispatchQueue(label: "ocr", attributes: .concurrent)
let group = DispatchGroup()
let slots = DispatchSemaphore(value: Int(opt("--jobs") ?? "8") ?? 8)
var results: [Int: [String: Any]] = [:]
var pending: [Int: Int] = [:]   // OCR jobs still running per sample
var flushed = -1
let resultsLock = NSLock()
func jsonLine(_ obj: [String: Any]) -> String { String(data: try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]), encoding: .utf8)! }
// Print the lines whose OCR is done, in sample order (live: as they come; video: everything at the end).
// Call with resultsLock held.
func flushReady(all: Bool = false) {
    for k in results.keys.sorted() {
        if !all && (pending[k] ?? 0) > 0 { break }
        print(jsonLine(results[k]!)); flushed = k
        results[k] = nil; pending[k] = nil
    }
    fflush(stdout)
}
// Live stop: the first request ends sampling and lets the queued OCR finish; if that takes over 3 s, or a
// second signal comes (Ctrl-C again, kill), print what is done and exit at once.
let stopLock = NSLock()
var stopRequested = false
func requestStop(force: Bool = false) {
    stopLock.lock(); let again = stopRequested; stopRequested = true; stopLock.unlock()
    if again {
        if force { exitNow("second stop request") }
        return
    }
    stopSema.signal()
    DispatchQueue.global().asyncAfter(deadline: .now() + 3) { exitNow("still busy 3 s after the stop request") }
}
func exitNow(_ why: String) -> Never {
    log("live: \(why): exiting now")
    resultsLock.lock(); flushReady(all: true)
    exit(0)
}
// Each region is its own job, so the 9–13 reads of a choose sample run in parallel too.
func submit(_ idx: Int, _ t: Double, choose: Bool, image: CGImage, jobs: [(String, (Int, Int, Int, Int), Bool)], carry: [String: Any]) {
    resultsLock.lock()
    results[idx] = ["frame": String(format: "s%05d", idx), "i": idx, "t": (t * 100).rounded() / 100, "choose": choose, "regions": carry]
    pending[idx] = jobs.count
    resultsLock.unlock()
    for (name, r, digits) in jobs {
        slots.wait()
        group.enter()
        ocrQueue.async {
            defer { slots.signal(); group.leave() }
            var lines: [[String: Any]] = []
            if let c = crop(image, r), !(precheck && name == "msg" && ocr(c, digits: false, fast: true).isEmpty) {
                lines = ocr(c, digits: digits)
                // The italic plate names misread differently at different scales (愛管侍 → 愛嘗待 at 2×, 愛管待 at 1×):
                // append a 1× read so parse.mjs can fall back to it when the 2× line matches no species.
                if plateNames.contains(name), let c1 = crop(image, r, scale: 1) { lines += ocr(c1, digits: false) }
            }
            resultsLock.lock()
            var regions = results[idx]!["regions"] as! [String: Any]
            regions[name] = lines
            results[idx]!["regions"] = regions
            pending[idx]! -= 1
            if live { flushReady() }
            resultsLock.unlock()
        }
    }
}

// Gate state
var idx = 0, lastT = 0.0
var msgGate = TextGate(empty: msgEmpty, force: msgForce)
// Ability/item banners: iPad banners have 400–700 stroke pixels (bannerEmpty 300).
var bannerGates = P.banners.map { _ in TextGate(empty: P.bannerEmpty, force: msgForce) }
var thumbs: [String: (prev: [Double], stable: Int, last: [Double]?)] = [:]
var chooseRun = 0, runReads = 0, lastPlateT = -Double.infinity
var previewNameSeen = false, previewNameCarry: [[String: Any]] = []
var chooseSamples = 0
let thumbBoxes: [(String, Box)] = P.previewName.flatMap { n in P.previewOwn.map { [("preview_name", n), ("preview_own", $0)] } } ?? []
let start = Date()
var featureTime = 0.0
if live {
    // liveStart: wall-clock time (Unix s) of t = 0, so live.mjs can measure latency.
    liveStart = Date()
    print(jsonLine(["profile": P.name, "live": true, "liveStart": liveStart.timeIntervalSince1970, "window": liveWindow]))
    fflush(stdout)
} else {
    print("{\"profile\":\"\(P.name)\"}")
}

func processFrame(_ f: Frame, _ t: Double) {
    lastT = t
    let f0 = Date()
    var jobs: [(String, (Int, Int, Int, Int), Bool)] = []
    var carry: [String: Any] = [:]

    // choose screen
    let feat = chooseFeature(f)
    let panelDist = feat.reduce(0, +) >= chooseMinTotal ? pearson(feat, chooseMean) : -1
    let choose = panelDist > chooseThreshold
    if choose { chooseSamples += 1; chooseRun += 1 } else { chooseRun = 0; runReads = 0 }
    if choose && chooseRun >= 2 && runReads < plateReadsPerRun && t - lastPlateT >= plateGap {
        runReads += 1; lastPlateT = t
        for (name, b, digits) in P.plates { jobs.append((name, f.rect(b), digits)) }
        if let fb = P.field { jobs.append(("field", f.rect(fb), false)) }
    }

    // message and ability/item banners
    let msgReason = msgGate.update(textGrid(f, P.msgText, 64, 8), t, allowed: !choose)
    if !msgReason.isEmpty { jobs.append(("msg", f.rect(msgCrop), false)) }
    // A settled message was already on screen when its stable run began: date the read from then.
    let lineT = msgReason == "stable" ? t - Double(msgGate.stable) / fps : t
    for (k, (name, b)) in P.banners.enumerated() where !bannerGates[k].update(textGrid(f, b, 24, 6), t, allowed: !choose).isEmpty {
        jobs.append((name, f.rect(b), false))
    }

    // Team preview (always before the first choose screen): name and own list.
    if !choose && chooseSamples == 0 {
        for (name, b) in thumbBoxes {
            let th = grayThumb(f, b)
            var s = thumbs[name] ?? (prev: [], stable: 0, last: nil)
            s.stable = !s.prev.isEmpty && meanAbs(th, s.prev) < 3 ? s.stable + 1 : 0
            s.prev = th
            let changed = s.last == nil || meanAbs(th, s.last!) > 6
            var want = s.stable >= stableSamples && changed
            if name == "preview_own" { want = want && previewNameSeen }
            if want { s.last = th; jobs.append((name, f.rect(b), false)) }
            thumbs[name] = s
        }
        if jobs.contains(where: { $0.0 == "preview_own" }) && !jobs.contains(where: { $0.0 == "preview_name" }) { carry["preview_name"] = previewNameCarry }
    }
    featureTime += Date().timeIntervalSince(f0)
    if debug { log(String(format: "%7.2f choose=%d pd=%5.2f text=%4.0f d=%.2f st=%d ab=%@ %@ %@", t, choose ? 1 : 0, panelDist, msgGate.total, msgGate.d, msgGate.stable,
                          bannerGates.map { String(format: "%3.0f", $0.total) }.joined(separator: "/"), msgReason, jobs.map { $0.0 }.joined(separator: ","))) }
    if noOcr { jobs = [] }
    if jobs.isEmpty && choose {
        // No reads needed, but parse.mjs still needs the choose screen for turn boundaries.
        resultsLock.lock()
        results[idx] = ["frame": String(format: "s%05d", idx), "i": idx, "t": (t * 100).rounded() / 100, "choose": true, "regions": [String: Any]()]
        pending[idx] = 0
        if live { flushReady() }
        resultsLock.unlock()
    } else if !jobs.isEmpty {
        guard let img = frameImage(f) else { idx += 1; return }
        let needsName = jobs.contains { $0.0 == "preview_name" }
        if needsName {
            // Read the preview name now so later preview_own reads can carry it and know a preview is up.
            let r = jobs.first { $0.0 == "preview_name" }!.1
            let res = crop(img, r).map { ocr($0, digits: false) } ?? []
            previewNameSeen = !res.isEmpty; previewNameCarry = res
            carry["preview_name"] = res
            jobs.removeAll { $0.0 == "preview_name" }
        }
        submit(idx, lineT, choose: choose, image: img, jobs: jobs, carry: carry)
    }
    idx += 1
}

var decoded = 0
if live {
    // Sample the latest captured frame on a fixed 1/fps grid (the stream only delivers frames that changed).
    let g = grabber!, s = stream!
    let tick = DispatchQueue(label: "tick")
    let timer = DispatchSource.makeTimerSource(queue: tick)
    var lastPNG = false, lastBoxCheck = -Double.infinity, stale = 0, lastRate = (0.0, 0)
    var candidate: (Double, Double, Double, Double)?, candidateN = 0
    timer.schedule(deadline: .now(), repeating: 1 / fps, leeway: .milliseconds(10))
    timer.setEventHandler {
        if getppid() == 1 { requestStop(force: true) }   // live.mjs / the terminal went away
        guard let pb = g.take(), CVPixelBufferGetWidth(pb) == liveSize.0, CVPixelBufferGetHeight(pb) == liveSize.1 else { stale += 1; return }
        let t = ((Date().timeIntervalSince(liveStart)) * 100).rounded() / 100
        decoded = g.received
        if t - lastRate.0 >= 30 {
            let rate = Double(decoded - lastRate.1) / max(1, t - lastRate.0)
            // macOS stops redrawing a covered window (a QuickTime window behind another one gave 0.8 frames/s).
            log(String(format: "live: t=%.0f s, %.1f frames/s from the window over the last %.0f s%@", t, rate, t - lastRate.0,
                       rate < fps * 0.75 ? " — below the sampling rate: keep the window uncovered (or the picture is static)" : ""))
            lastRate = (t, decoded)
        }
        let skip = withFrame(pb) { f0 -> Bool in
            guard displayMode, t - lastBoxCheck >= 1 else { return livePaused }
            lastBoxCheck = t
            // A box inside the picture is a dark scene. One reaching past it means the border isn't black
            // any more: a new picture (same aspect, held 2 s) is taken over, anything else pauses sampling.
            let b = nonBlackBox(f0)
            let inside = b.map { $0.0 >= liveContent.0 - 0.01 && $0.1 >= liveContent.1 - 0.01 && $0.2 <= liveContent.2 + 0.01 && $0.3 <= liveContent.3 + 0.01 } ?? true
            if inside {
                if livePaused && b != nil { livePaused = false; log(String(format: "live: t=%.0f s, game picture back", t)) }
                candidate = nil
                return livePaused
            }
            if gamePicture(b, f0.width, f0.height, aspects: [P.aspect]) {
                candidateN = candidate.map { sameBox($0, b!) } == true ? candidateN + 1 : 1
                candidate = b
                if candidateN >= 2 {
                    let old = liveContent
                    liveContent = b!; candidate = nil; livePaused = false
                    log(String(format: "live: t=%.0f s, new game picture at x %.3f–%.3f, y %.3f–%.3f", t, b!.0, b!.2, b!.1, b!.3))
                    if abs((b!.2 - b!.0) - (old.2 - old.0)) > 0.02 * (old.2 - old.0), let cfg = liveCfg {
                        let (w, h, _) = streamSize(b!)
                        cfg.width = w; cfg.height = h
                        s.updateConfiguration(cfg) { e in tick.async { if e == nil { liveSize = (w, h) } } }
                    }
                }
            } else {
                candidate = nil
                if !livePaused { livePaused = true; log(String(format: "live: t=%.0f s, game picture gone (%@) — waiting for game picture…", t, describeBox(b, f0.width, f0.height))) }
            }
            return livePaused
        }
        if skip { return }
        withFrame(pb) { f0 in
            // Grow the picture box as brighter scenes show more of it (a dark scene never shrinks it).
            if !displayMode, t - lastBoxCheck >= 2, let b = nonBlackBox(f0) {
                lastBoxCheck = t
                let grown = (min(liveContent.0, b.0), min(liveContent.1, b.1), max(liveContent.2, b.2), max(liveContent.3, b.3))
                if grown != liveContent {
                    log(String(format: "live: picture box grew to x %.3f–%.3f, y %.3f–%.3f", grown.0, grown.2, grown.1, grown.3))
                    liveContent = grown
                }
            }
            var f = f0
            f.cx = Int(liveContent.0 * Double(f.width)); f.cy = Int(liveContent.1 * Double(f.height))
            f.cw = Int((liveContent.2 - liveContent.0) * Double(f.width)); f.ch = Int((liveContent.3 - liveContent.1) * Double(f.height))
            if !lastPNG, let path = opt("--content-png"), let img = frameImage(f), let c = img.cropping(to: CGRect(x: f.cx, y: f.cy, width: f.cw, height: f.ch)),
               let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, "public.png" as CFString, 1, nil) {
                CGImageDestinationAddImage(dst, c, nil); CGImageDestinationFinalize(dst); lastPNG = true
            }
            processFrame(f, t)
        }
    }
    for sig in [SIGINT, SIGTERM, SIGHUP] { signal(sig, SIG_IGN) }
    // Kept alive by withExtendedLifetime below: under -O a source released after setup is cancelled, and the
    // signals then stay ignored (Ctrl-C and kill did nothing).
    let sigSources = [SIGINT, SIGTERM, SIGHUP].map { sig -> DispatchSourceSignal in
        let src = DispatchSource.makeSignalSource(signal: sig, queue: .global())
        src.setEventHandler { requestStop(force: true) }
        src.resume()
        return src
    }
    // --duration counts from the start of the program (the wait for a picture included).
    if let d = duration { DispatchQueue.global().asyncAfter(deadline: .now() + max(0, d - Date().timeIntervalSince(programStart))) { requestStop() } }
    timer.resume()
    withExtendedLifetime(sigSources) { stopSema.wait() }
    tick.sync { timer.cancel() }
    if let e = g.stopError { log("live: stream stopped: \(e)") } else { waitAsync("stop capture") { done in s.stopCapture { done($0) } } }
    if stale > 4 { log("live: \(stale) ticks without a frame of the expected size") }
} else {
    decoded = decode(track!, fps: fps, processFrame)
}
let loopTime = Date().timeIntervalSince(start)
group.wait()
// A trailing empty line keeps parse.mjs's "last frame time" the same as a full-frame run.
resultsLock.lock()
results[idx] = ["frame": String(format: "s%05d", idx), "i": idx, "t": (lastT * 100).rounded() / 100, "choose": false, "regions": [String: Any]()]
flushReady(all: true)
resultsLock.unlock()
var ru = rusage()
getrusage(RUSAGE_SELF, &ru)
let cpu = Double(ru.ru_utime.tv_sec + ru.ru_stime.tv_sec) + Double(ru.ru_utime.tv_usec + ru.ru_stime.tv_usec) / 1e6
log(String(format: "fasttrack: %d %@, %d sampled at %.1f fps, %d choose samples; OCR calls %d accurate + %d fast; features %.1fs; %@ loop %.1fs; total %.1fs; CPU %.1fs (%.0f%% of one core)",
           decoded, live ? "frames captured" : "decoded", idx, fps, chooseSamples, ocrCalls.value, fastCalls.value, featureTime, live ? "capture" : "decode",
           loopTime, Date().timeIntervalSince(start), cpu, 100 * cpu / max(1e-9, Date().timeIntervalSince(start))))
