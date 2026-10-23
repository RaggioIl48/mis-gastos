import Foundation

/// Conversión y formato de pesos colombianos (COP).
///
/// El usuario escribe los valores en miles (`25` = $25.000) y la app guarda
/// siempre pesos completos como `Int`, nunca como número decimal.
enum Money {
    /// Máximo de dígitos enteros (en miles) aceptados: hasta $9.999.999.999.
    static let maxThousandsDigits = 7

    enum ParseError: Error, Equatable {
        case empty
        case invalidCharacters
        case tooManyDecimals
        case zero
        case tooLarge

        var message: String {
            switch self {
            case .empty: return "Escribe un valor."
            case .invalidCharacters: return "Usa solo números y, si quieres, una coma decimal."
            case .tooManyDecimals: return "Usa como máximo tres decimales."
            case .zero: return "El valor debe ser mayor que cero."
            case .tooLarge: return "El valor es demasiado alto."
            }
        }
    }

    /// Convierte lo que escribe el usuario (en miles) a pesos completos.
    ///
    /// `"25"` → 25.000, `"1250"` → 1.250.000, `"2,5"` → 2.500.
    /// Acepta coma o punto como separador decimal y usa solo aritmética entera.
    static func pesos(fromThousandsInput input: String) -> Result<Int, ParseError> {
        let text = input
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: ".")
        guard !text.isEmpty else { return .failure(.empty) }

        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count <= 2, parts.allSatisfy({ $0.allSatisfy(\.isASCIIDigit) }) else {
            return .failure(.invalidCharacters)
        }

        let integerDigits = String(parts[0].drop(while: { $0 == "0" }))
        let fractionDigits = parts.count == 2 ? String(parts[1]) : ""
        guard fractionDigits.count <= 3 else { return .failure(.tooManyDecimals) }
        guard integerDigits.count <= maxThousandsDigits else { return .failure(.tooLarge) }

        let thousands = Int(integerDigits) ?? 0
        let fraction = Int(fractionDigits.padding(toLength: 3, withPad: "0", startingAt: 0)) ?? 0
        let pesos = thousands * 1000 + fraction
        guard pesos > 0 else { return .failure(.zero) }
        return .success(pesos)
    }

    /// Texto para el campo de valor a partir de pesos completos (inverso de `pesos(fromThousandsInput:)`).
    ///
    /// 25.000 → `"25"`, 2.500 → `"2,5"`.
    static func thousandsInput(fromPesos pesos: Int) -> String {
        let thousands = pesos / 1000
        let remainder = pesos % 1000
        guard remainder != 0 else { return String(thousands) }
        var fraction = String(format: "%03d", remainder)
        while fraction.hasSuffix("0") { fraction.removeLast() }
        return "\(thousands),\(fraction)"
    }

    /// Formato colombiano: `$25.000`, `$1.250.000`.
    ///
    /// Se hace a mano para que el resultado no dependa de la región del teléfono.
    static func format(_ pesos: Int) -> String {
        let digits = String(pesos.magnitude)
        var grouped = ""
        for (index, character) in digits.enumerated() {
            if index > 0 && (digits.count - index) % 3 == 0 {
                grouped.append(".")
            }
            grouped.append(character)
        }
        return (pesos < 0 ? "-$" : "$") + grouped
    }
}
