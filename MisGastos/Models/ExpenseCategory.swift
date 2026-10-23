import Foundation
import SwiftData

@Model
final class ExpenseCategory {
    var name: String
    /// Nombre de un símbolo de SF Symbols.
    var symbol: String
    var sortOrder: Int

    // Solo se borra una categoría sin gastos (ver `CategoryRules.canDelete`).
    @Relationship(deleteRule: .nullify, inverse: \Expense.category)
    var expenses: [Expense] = []

    init(name: String, symbol: String, sortOrder: Int) {
        self.name = name
        self.symbol = symbol
        self.sortOrder = sortOrder
    }
}

extension ExpenseCategory {
    static let fallbackName = "Sin categoría"
    static let fallbackSymbol = "questionmark.circle"
    static let newCategorySymbol = "tag.fill"

    static let defaults: [(name: String, symbol: String)] = [
        ("Alimentación", "fork.knife"),
        ("Transporte", "car.fill"),
        ("Vivienda", "house.fill"),
        ("Servicios", "bolt.fill"),
        ("Salud", "cross.case.fill"),
        ("Educación", "book.fill"),
        ("Entretenimiento", "film.fill"),
        ("Otros", "ellipsis.circle.fill"),
    ]

    /// Iconos que se pueden elegir al crear o editar una categoría.
    static let availableSymbols = [
        "fork.knife", "cup.and.saucer.fill", "cart.fill", "car.fill", "bus.fill",
        "fuelpump.fill", "airplane", "house.fill", "bolt.fill", "drop.fill",
        "wifi", "phone.fill", "cross.case.fill", "pills.fill", "book.fill",
        "graduationcap.fill", "film.fill", "gamecontroller.fill", "tshirt.fill", "gift.fill",
        "pawprint.fill", "heart.fill", "wrench.and.screwdriver.fill", "tag.fill", "ellipsis.circle.fill",
    ]
}

enum CategorySeeder {
    static let didSeedKey = "categoriasIniciales.creadas"

    /// Crea las categorías iniciales una sola vez, en el primer arranque.
    @MainActor
    static func seedIfNeeded(context: ModelContext, defaults: UserDefaults = .standard) {
        guard !defaults.bool(forKey: didSeedKey) else { return }

        let existing = (try? context.fetchCount(FetchDescriptor<ExpenseCategory>())) ?? 0
        if existing == 0 {
            for (index, item) in ExpenseCategory.defaults.enumerated() {
                context.insert(ExpenseCategory(name: item.name, symbol: item.symbol, sortOrder: index))
            }
        }
        do {
            try context.save()
            defaults.set(true, forKey: didSeedKey)
        } catch {
            // Se reintentará en el próximo arranque.
        }
    }
}
