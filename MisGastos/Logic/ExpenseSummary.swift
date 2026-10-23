import Foundation

/// Lo mínimo que necesitan los cálculos de totales. Permite probarlos sin SwiftData.
protocol ExpenseLike {
    var amount: Int { get }
    var date: Date { get }
}

struct DayGroup<Item>: Identifiable {
    let day: Date
    let items: [Item]
    var id: Date { day }
}

enum ExpenseSummary {
    static func total<S: Sequence>(of expenses: S) -> Int where S.Element: ExpenseLike {
        expenses.reduce(0) { $0 + $1.amount }
    }

    static func total<S: Sequence>(of expenses: S, inMonthOf month: Date, calendar: Calendar) -> Int
    where S.Element: ExpenseLike {
        total(of: expenses.filter { calendar.isDate($0.date, equalTo: month, toGranularity: .month) })
    }

    static func total<S: Sequence>(of expenses: S, onDayOf day: Date, calendar: Calendar) -> Int
    where S.Element: ExpenseLike {
        total(of: expenses.filter { calendar.isDate($0.date, inSameDayAs: day) })
    }

    static func startOfMonth(containing date: Date, calendar: Calendar) -> Date {
        calendar.dateInterval(of: .month, for: date)?.start ?? calendar.startOfDay(for: date)
    }

    static func month(byAdding value: Int, to month: Date, calendar: Calendar) -> Date {
        calendar.date(byAdding: .month, value: value, to: month) ?? month
    }

    /// Agrupa por día, del más reciente al más antiguo, conservando el orden dentro de cada día.
    static func groupedByDay<E: ExpenseLike>(_ expenses: [E], calendar: Calendar) -> [DayGroup<E>] {
        Dictionary(grouping: expenses) { calendar.startOfDay(for: $0.date) }
            .map { DayGroup(day: $0.key, items: $0.value) }
            .sorted { $0.day > $1.day }
    }
}
