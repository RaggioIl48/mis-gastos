import XCTest
@testable import MisGastos

final class MoneyTests: XCTestCase {
    func testInputIsInThousands() {
        XCTAssertEqual(Money.pesos(fromThousandsInput: "25"), .success(25_000))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "1250"), .success(1_250_000))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "1"), .success(1_000))
    }

    func testDecimalsWithCommaOrDot() {
        XCTAssertEqual(Money.pesos(fromThousandsInput: "2,5"), .success(2_500))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "2.5"), .success(2_500))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "0,125"), .success(125))
        XCTAssertEqual(Money.pesos(fromThousandsInput: ",5"), .success(500))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "12,"), .success(12_000))
    }

    func testIgnoresSurroundingSpacesAndLeadingZeros() {
        XCTAssertEqual(Money.pesos(fromThousandsInput: "  25 "), .success(25_000))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "0025"), .success(25_000))
    }

    func testRejectsInvalidInput() {
        XCTAssertEqual(Money.pesos(fromThousandsInput: ""), .failure(.empty))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "   "), .failure(.empty))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "0"), .failure(.zero))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "0,000"), .failure(.zero))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "abc"), .failure(.invalidCharacters))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "-5"), .failure(.invalidCharacters))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "1,2,3"), .failure(.invalidCharacters))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "1,2345"), .failure(.tooManyDecimals))
        XCTAssertEqual(Money.pesos(fromThousandsInput: "12345678"), .failure(.tooLarge))
    }

    func testAcceptsLargestAllowedValue() {
        XCTAssertEqual(Money.pesos(fromThousandsInput: "9999999,999"), .success(9_999_999_999))
    }

    func testColombianFormat() {
        XCTAssertEqual(Money.format(0), "$0")
        XCTAssertEqual(Money.format(999), "$999")
        XCTAssertEqual(Money.format(25_000), "$25.000")
        XCTAssertEqual(Money.format(1_250_000), "$1.250.000")
        XCTAssertEqual(Money.format(123_456_789), "$123.456.789")
        XCTAssertEqual(Money.format(-25_000), "-$25.000")
    }

    func testThousandsInputFromPesos() {
        XCTAssertEqual(Money.thousandsInput(fromPesos: 25_000), "25")
        XCTAssertEqual(Money.thousandsInput(fromPesos: 1_250_000), "1250")
        XCTAssertEqual(Money.thousandsInput(fromPesos: 2_500), "2,5")
        XCTAssertEqual(Money.thousandsInput(fromPesos: 125), "0,125")
    }

    func testRoundTrip() {
        for pesos in [1, 125, 2_500, 25_000, 1_250_000, 9_999_999_999] {
            let text = Money.thousandsInput(fromPesos: pesos)
            XCTAssertEqual(Money.pesos(fromThousandsInput: text), .success(pesos), "Falló con \(pesos)")
        }
    }
}
