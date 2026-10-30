import Foundation
import Vision

if CommandLine.arguments.count < 2 { fputs("missing image path\n", stderr); exit(2) }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
do {
    let data = try Data(contentsOf: url)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    let handler = VNImageRequestHandler(data: data, options: [:])
    try handler.perform([request])
    let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    print(text)
} catch {
    fputs("Vision OCR failed: \(error.localizedDescription)\n", stderr)
    exit(1)
}
