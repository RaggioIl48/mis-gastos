import CoreTransferable
import Foundation
import UniformTypeIdentifiers

/// Exporta gastos a CSV con `;` como separador (lo que espera Excel en español).
/// El valor se exporta en pesos completos y también con formato `$25.000`.
enum CSVExporter {
    struct Row: Equatable {
        var date: Date
        var category: String
        var note: String
        var amount: Int
    }

    static let separator = ";"
    static let header = ["Fecha", "Categoría", "Descripción", "Valor (COP)", "Valor"]

    static func makeCSV(rows: [Row], calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"

        var lines = [header.joined(separator: separator)]
        for row in rows {
            let fields = [
                formatter.string(from: row.date),
                row.category,
                row.note,
                String(row.amount),
                Money.format(row.amount),
            ]
            lines.append(fields.map(escape).joined(separator: separator))
        }
        return lines.joined(separator: "\r\n") + "\r\n"
    }

    static func escape(_ field: String) -> String {
        let special = Set(";\"\n\r".unicodeScalars)
        guard field.unicodeScalars.contains(where: special.contains) else { return field }
        return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }
}

/// Archivo CSV que se comparte con la hoja de compartir de iOS. Se genera solo al exportar.
struct CSVFile: Transferable {
    let rows: [CSVExporter.Row]

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .commaSeparatedText) { file in
            // La marca BOM hace que Excel lea bien las tildes.
            Data(("\u{FEFF}" + CSVExporter.makeCSV(rows: file.rows, calendar: .current)).utf8)
        }
        .suggestedFileName("mis-gastos.csv")
    }
}
