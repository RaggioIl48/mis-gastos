import SwiftData
import SwiftUI

struct RootView: View {
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Inicio", systemImage: "house") }
            HistoryView()
                .tabItem { Label("Historial", systemImage: "list.bullet") }
            CategoriesView()
                .tabItem { Label("Categorías", systemImage: "square.grid.2x2") }
        }
        .task {
            CategorySeeder.seedIfNeeded(context: modelContext)
        }
    }
}

#Preview {
    RootView()
        .modelContainer(for: [Expense.self, ExpenseCategory.self], inMemory: true)
}
