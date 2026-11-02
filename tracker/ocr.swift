// Batch OCR for PokéCal turn-log prototype: Apple Vision VNRecognizeTextRequest.
// Usage: swift ocr.swift <fps> <frame.jpg> [...]  (or a single directory)
// Prints one JSON line per frame, in input order:
//   {"frame":"f00001.jpg","t":0,"regions":{"msg":[{"text":"…","conf":0.5,"y":0.8}],…}}
// Regions are x,y,w,h in 2360×1640 recorded pixels (layout.md). Text regions use
// zh-Hant+en-US with language correction; *_hp regions use en-US without correction.
// Plates and HP boxes are only read on choose-action screens (move list has text).
import Foundation
import Vision
import CoreGraphics
import ImageIO

struct Region { let name: String; let box: CGRect; let digits: Bool }
func r(_ n: String, _ x: Int, _ y: Int, _ w: Int, _ h: Int, digits: Bool = false) -> Region {
    Region(name: n, box: CGRect(x: x, y: y, width: w, height: h), digits: digits)
}
let always = [
    r("msg", 150, 1130, 1250, 320),
    r("field", 390, 65, 640, 60),
    r("moves", 1687, 891, 632, 600),
    r("ability", 59, 614, 420, 120),
    r("item", 59, 540, 420, 150),
    r("preview_name", 215, 245, 395, 60),
]
let choose = [
    r("opp_left", 1333, 47, 490, 153), r("opp_right", 1823, 47, 490, 153),
    r("you_left", 53, 1440, 490, 153), r("you_right", 537, 1440, 490, 153),
    r("opp_left_hp", 1530, 125, 290, 80, digits: true), r("opp_right_hp", 2020, 125, 290, 80, digits: true),
    r("you_left_hp", 263, 1515, 290, 80, digits: true), r("you_right_hp", 747, 1515, 290, 80, digits: true),
]

func load(_ path: String) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

// Crop and upscale 2× (the earlier trial found 2× crops read better).
func crop(_ img: CGImage, _ box: CGRect) -> CGImage? {
    guard let c = img.cropping(to: box) else { return nil }
    let w = c.width * 2, h = c.height * 2
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    ctx.interpolationQuality = .high
    ctx.draw(c, in: CGRect(x: 0, y: 0, width: w, height: h))
    return ctx.makeImage()
}

func ocr(_ img: CGImage, digits: Bool) -> [[String: Any]] {
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = digits ? ["en-US"] : ["zh-Hant", "en-US"]
    req.usesLanguageCorrection = !digits
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

var args = Array(CommandLine.arguments.dropFirst())
let fps = Double(args.removeFirst()) ?? 2
var paths = args
if paths.count == 1, (try? FileManager.default.contentsOfDirectory(atPath: paths[0])) != nil {
    let dir = paths[0]
    paths = (try! FileManager.default.contentsOfDirectory(atPath: dir)).filter { $0.hasSuffix(".jpg") || $0.hasSuffix(".png") }
        .sorted().map { "\(dir)/\($0)" }
}

var out = [String](repeating: "", count: paths.count)
let lock = NSLock()
DispatchQueue.concurrentPerform(iterations: paths.count) { i in
    var regions: [String: Any] = [:]
    if let img = load(paths[i]) {
        for reg in always { if let c = crop(img, reg.box) { regions[reg.name] = ocr(c, digits: false) } }
        let moveLines = (regions["moves"] as? [[String: Any]])?.count ?? 0
        let previewLines = (regions["preview_name"] as? [[String: Any]])?.count ?? 0
        if moveLines == 0 && previewLines > 0, let c = crop(img, CGRect(x: 106, y: 319, width: 637, height: 914)) {
            regions["preview_own"] = ocr(c, digits: false)
        }
        if moveLines >= 3 {
            for reg in choose { if let c = crop(img, reg.box) { regions[reg.name] = ocr(c, digits: reg.digits) } }
        }
    }
    let name = (paths[i] as NSString).lastPathComponent
    let num = Int(name.filter { $0.isNumber }) ?? (i + 1)
    let obj: [String: Any] = ["frame": name, "i": i, "t": Double(num - 1) / fps, "regions": regions]
    let data = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
    lock.lock(); out[i] = String(data: data, encoding: .utf8)!; lock.unlock()
}
for line in out { print(line) }
