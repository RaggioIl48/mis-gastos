import SwiftData
import SwiftUI

@main
struct MisGastosApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
        // Base de datos local en el dispositivo; sin red ni cuentas.
        .modelContainer(for: [Expense.self, ExpenseCategory.self])
    }
}
