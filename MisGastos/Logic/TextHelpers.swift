import Foundation

extension String {
    /// Clave para comparar textos sin importar mayúsculas, tildes ni espacios sobrantes.
    var comparisonKey: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "es_CO"))
    }

    var capitalizedFirstLetter: String {
        prefix(1).uppercased() + dropFirst()
    }
}

extension Character {
    var isASCIIDigit: Bool {
        self >= "0" && self <= "9"
    }
}

/// Formatos de fecha en español de Colombia.
enum AppFormat {
    static let locale = Locale(identifier: "es_CO")

    /// "Octubre de 2026"
    static func monthTitle(_ date: Date) -> String {
        date.formatted(.dateTime.month(.wide).year().locale(locale)).capitalizedFirstLetter
    }

    /// "Hoy", "Ayer" o "Lunes, 20 de octubre"
    static func dayTitle(_ date: Date, calendar: Calendar = .current) -> String {
        if calendar.isDateInToday(date) { return "Hoy" }
        if calendar.isDateInYesterday(date) { return "Ayer" }
        return date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(locale)).capitalizedFirstLetter
    }

    /// "22 oct"
    static func shortDate(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated).locale(locale))
    }
}
