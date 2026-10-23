import Foundation

/// Datos que identifican un gasto para detectar registros repetidos por accidente.
struct DuplicateKey: Equatable {
    var amount: Int
    var categoryName: String?
    var date: Date
    var note: String
    var createdAt: Date
}

enum DuplicateDetector {
    /// Dos gastos iguales guardados con menos de este intervalo se consideran posible duplicado.
    static let window: TimeInterval = 120

    static func isLikelyDuplicate(_ candidate: DuplicateKey, among existing: [DuplicateKey], calendar: Calendar) -> Bool {
        existing.contains { other in
            other.amount == candidate.amount
                && other.categoryName?.comparisonKey == candidate.categoryName?.comparisonKey
                && calendar.isDate(other.date, inSameDayAs: candidate.date)
                && other.note.comparisonKey == candidate.note.comparisonKey
                && abs(candidate.createdAt.timeIntervalSince(other.createdAt)) <= window
        }
    }
}
