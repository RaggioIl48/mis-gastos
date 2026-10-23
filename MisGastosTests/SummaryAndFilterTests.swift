import XCTest
@testable import MisGastos

private struct Item: ExpenseLike {
    var amount: Int
    var date: Date
    var category: String? = nil
}

/// Calendario fijo para que las pruebas no dependan de la zona horaria del equipo.
private var bogota: Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "America/Bogota")!
    return calendar
}

private func day(_ year: Int, _ month: Int, _ day: Int, hour: Int = 12) -> Date {
    bogota.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
}

final class ExpenseSummaryTests: XCTestCase {
    private let items = [
        Item(amount: 25_000, date: day(2026, 10, 22, hour: 8)),
        Item(amount: 10_000, date: day(2026, 10, 22, hour: 23)),
        Item(amount: 5_000, date: day(2026, 10, 1, hour: 0)),
        Item(amount: 100_000, date: day(2026, 9, 30, hour: 23)),
    ]

    func testTotalOfEverything() {
        XCTAssertEqual(ExpenseSummary.total(of: items), 140_000)
        XCTAssertEqual(ExpenseSummary.total(of: [Item]()), 0)
    }

    func testMonthTotalRespectsMonthBoundaries() {
        XCTAssertEqual(ExpenseSummary.total(of: items, inMonthOf: day(2026, 10, 15), calendar: bogota), 40_000)
        XCTAssertEqual(ExpenseSummary.total(of: items, inMonthOf: day(2026, 9, 1), calendar: bogota), 100_000)
        XCTAssertEqual(ExpenseSummary.total(of: items, inMonthOf: day(2026, 8, 1), calendar: bogota), 0)
    }

    func testDayTotal() {
        XCTAssertEqual(ExpenseSummary.total(of: items, onDayOf: day(2026, 10, 22), calendar: bogota), 35_000)
        XCTAssertEqual(ExpenseSummary.total(of: items, onDayOf: day(2026, 10, 21), calendar: bogota), 0)
    }

    func testMonthNavigation() {
        let start = ExpenseSummary.startOfMonth(containing: day(2026, 10, 22), calendar: bogota)
        XCTAssertEqual(start, day(2026, 10, 1, hour: 0))
        XCTAssertEqual(ExpenseSummary.month(byAdding: -1, to: start, calendar: bogota), day(2026, 9, 1, hour: 0))
        XCTAssertEqual(ExpenseSummary.month(byAdding: -10, to: start, calendar: bogota), day(2025, 12, 1, hour: 0))
    }

    func testGroupedByDayNewestFirst() {
        let groups = ExpenseSummary.groupedByDay(items, calendar: bogota)
        XCTAssertEqual(groups.map(\.day), [
            day(2026, 10, 22, hour: 0),
            day(2026, 10, 1, hour: 0),
            day(2026, 9, 30, hour: 0),
        ])
        XCTAssertEqual(groups[0].items.map(\.amount), [25_000, 10_000])
    }
}

final class ExpenseFilterTests: XCTestCase {
    func testInactiveFilterMatchesEverything() {
        let filter = ExpenseFilter<String>(startDate: day(2026, 10, 1), endDate: day(2026, 10, 1))
        XCTAssertFalse(filter.isActive)
        XCTAssertTrue(filter.matches(category: nil, date: day(2020, 1, 1), calendar: bogota))
        XCTAssertTrue(filter.matches(category: "Salud", date: day(2030, 1, 1), calendar: bogota))
    }

    func testCategoryFilter() {
        let filter = ExpenseFilter(category: "Salud", startDate: .now, endDate: .now)
        XCTAssertTrue(filter.isActive)
        XCTAssertTrue(filter.matches(category: "Salud", date: .now, calendar: bogota))
        XCTAssertFalse(filter.matches(category: "Transporte", date: .now, calendar: bogota))
        XCTAssertFalse(filter.matches(category: nil, date: .now, calendar: bogota))
    }

    func testDateRangeIncludesBothDays() {
        let filter = ExpenseFilter<String>(filtersByDate: true, startDate: day(2026, 10, 5), endDate: day(2026, 10, 10))
        XCTAssertTrue(filter.matches(category: nil, date: day(2026, 10, 5, hour: 0), calendar: bogota))
        XCTAssertTrue(filter.matches(category: nil, date: day(2026, 10, 10, hour: 23), calendar: bogota))
        XCTAssertFalse(filter.matches(category: nil, date: day(2026, 10, 4, hour: 23), calendar: bogota))
        XCTAssertFalse(filter.matches(category: nil, date: day(2026, 10, 11, hour: 0), calendar: bogota))
    }

    func testReversedDateRangeStillWorks() {
        let filter = ExpenseFilter<String>(filtersByDate: true, startDate: day(2026, 10, 10), endDate: day(2026, 10, 5))
        XCTAssertTrue(filter.matches(category: nil, date: day(2026, 10, 7), calendar: bogota))
    }
}

final class DuplicateDetectorTests: XCTestCase {
    private let now = day(2026, 10, 22, hour: 10)

    private func key(amount: Int = 25_000, category: String? = "Alimentación", note: String = "Almuerzo", secondsAgo: TimeInterval = 0) -> DuplicateKey {
        DuplicateKey(amount: amount, categoryName: category, date: now, note: note, createdAt: now.addingTimeInterval(-secondsAgo))
    }

    func testDetectsRecentIdenticalExpense() {
        XCTAssertTrue(DuplicateDetector.isLikelyDuplicate(key(), among: [key(secondsAgo: 30)], calendar: bogota))
    }

    func testIgnoresCaseAccentsAndSpaces() {
        let existing = key(category: "alimentacion", note: " almuerzo ", secondsAgo: 10)
        XCTAssertTrue(DuplicateDetector.isLikelyDuplicate(key(), among: [existing], calendar: bogota))
    }

    func testDifferentDataIsNotDuplicate() {
        let candidate = key()
        XCTAssertFalse(DuplicateDetector.isLikelyDuplicate(candidate, among: [key(amount: 26_000, secondsAgo: 10)], calendar: bogota))
        XCTAssertFalse(DuplicateDetector.isLikelyDuplicate(candidate, among: [key(category: "Transporte", secondsAgo: 10)], calendar: bogota))
        XCTAssertFalse(DuplicateDetector.isLikelyDuplicate(candidate, among: [key(note: "Cena", secondsAgo: 10)], calendar: bogota))
        XCTAssertFalse(DuplicateDetector.isLikelyDuplicate(candidate, among: [], calendar: bogota))
    }

    func testOldExpenseIsNotDuplicate() {
        let old = key(secondsAgo: DuplicateDetector.window + 1)
        XCTAssertFalse(DuplicateDetector.isLikelyDuplicate(key(), among: [old], calendar: bogota))
    }
}

final class CategoryRulesTests: XCTestCase {
    func testValidName() {
        XCTAssertNil(CategoryRules.validationError(for: "Mascotas", existingNames: ["Salud"]))
    }

    func testRejectsEmptyLongAndRepeatedNames() {
        XCTAssertNotNil(CategoryRules.validationError(for: "   ", existingNames: []))
        XCTAssertNotNil(CategoryRules.validationError(for: String(repeating: "a", count: 31), existingNames: []))
        XCTAssertNotNil(CategoryRules.validationError(for: "educacion", existingNames: ["Educación"]))
        XCTAssertNotNil(CategoryRules.validationError(for: " SALUD ", existingNames: ["Salud"]))
    }

    func testOnlyEmptyCategoriesCanBeDeleted() {
        XCTAssertTrue(CategoryRules.canDelete(expenseCount: 0))
        XCTAssertFalse(CategoryRules.canDelete(expenseCount: 1))
    }

    func testUsageText() {
        XCTAssertEqual(CategoryRules.usageText(1), "1 gasto")
        XCTAssertEqual(CategoryRules.usageText(3), "3 gastos")
    }
}

final class CSVExporterTests: XCTestCase {
    func testExportsFullPesosAndFormattedValue() {
        let rows = [CSVExporter.Row(date: day(2026, 10, 22), category: "Alimentación", note: "Almuerzo", amount: 25_000)]
        let csv = CSVExporter.makeCSV(rows: rows, calendar: bogota)
        XCTAssertEqual(csv, "Fecha;Categoría;Descripción;Valor (COP);Valor\r\n2026-10-22;Alimentación;Almuerzo;25000;$25.000\r\n")
    }

    func testEscapesSpecialCharacters() {
        XCTAssertEqual(CSVExporter.escape("simple"), "simple")
        XCTAssertEqual(CSVExporter.escape("a;b"), "\"a;b\"")
        XCTAssertEqual(CSVExporter.escape("dijo \"hola\""), "\"dijo \"\"hola\"\"\"")
        XCTAssertEqual(CSVExporter.escape("línea\r\nnueva"), "\"línea\r\nnueva\"")
    }
}
