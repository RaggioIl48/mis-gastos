import Foundation
import SwiftData

@Model
final class Expense {
    /// Valor en pesos colombianos completos (25.000, no 25).
    var amount: Int
    var note: String
    var date: Date
    var createdAt: Date
    var category: ExpenseCategory?

    init(amount: Int, note: String = "", date: Date = .now, category: ExpenseCategory? = nil, createdAt: Date = .now) {
        self.amount = amount
        self.note = note
        self.date = date
        self.category = category
        self.createdAt = createdAt
    }
}

extension Expense: ExpenseLike {}

extension Expense {
    var duplicateKey: DuplicateKey {
        DuplicateKey(amount: amount, categoryName: category?.name, date: date, note: note, createdAt: createdAt)
    }

    var csvRow: CSVExporter.Row {
        CSVExporter.Row(date: date, category: category?.name ?? ExpenseCategory.fallbackName, note: note, amount: amount)
    }
}
