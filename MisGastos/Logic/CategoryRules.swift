import Foundation

enum CategoryRules {
    static let maxNameLength = 30

    static func normalizedName(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Devuelve el motivo por el que el nombre no es válido, o `nil` si se puede usar.
    static func validationError(for name: String, existingNames: [String]) -> String? {
        let clean = normalizedName(name)
        if clean.isEmpty { return "Escribe un nombre." }
        if clean.count > maxNameLength { return "Usa como máximo \(maxNameLength) caracteres." }
        if existingNames.contains(where: { $0.comparisonKey == clean.comparisonKey }) {
            return "Ya existe una categoría con ese nombre."
        }
        return nil
    }

    /// Las categorías con gastos se conservan para no alterar el historial.
    static func canDelete(expenseCount: Int) -> Bool {
        expenseCount == 0
    }

    static func usageText(_ count: Int) -> String {
        count == 1 ? "1 gasto" : "\(count) gastos"
    }
}
