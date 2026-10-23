import Foundation

/// Filtro del historial por categoría y rango de fechas (ambos días incluidos).
struct ExpenseFilter<CategoryID: Hashable>: Equatable {
    var category: CategoryID?
    var filtersByDate: Bool
    var startDate: Date
    var endDate: Date

    init(category: CategoryID? = nil, filtersByDate: Bool = false, startDate: Date, endDate: Date) {
        self.category = category
        self.filtersByDate = filtersByDate
        self.startDate = startDate
        self.endDate = endDate
    }

    var isActive: Bool { category != nil || filtersByDate }

    func matches(category candidate: CategoryID?, date: Date, calendar: Calendar) -> Bool {
        if let category, candidate != category { return false }
        guard filtersByDate else { return true }

        let lower = calendar.startOfDay(for: min(startDate, endDate))
        let lastDay = calendar.startOfDay(for: max(startDate, endDate))
        guard let upper = calendar.date(byAdding: .day, value: 1, to: lastDay) else { return false }
        return date >= lower && date < upper
    }
}
