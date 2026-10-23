import SwiftData
import SwiftUI

struct HistoryView: View {
    @Query(sort: [
        SortDescriptor(\Expense.date, order: .reverse),
        SortDescriptor(\Expense.createdAt, order: .reverse),
    ])
    private var expenses: [Expense]
    @Query(sort: \ExpenseCategory.sortOrder) private var categories: [ExpenseCategory]

    @State private var filter = ExpenseFilter<PersistentIdentifier>(
        startDate: ExpenseSummary.startOfMonth(containing: .now, calendar: .current),
        endDate: .now
    )
    @State private var showingFilters = false
    @State private var showingNewExpense = false
    @State private var editingExpense: Expense?
    @State private var expenseToDelete: Expense?

    private let calendar = Calendar.current

    private var filteredExpenses: [Expense] {
        expenses.filter {
            filter.matches(category: $0.category?.persistentModelID, date: $0.date, calendar: calendar)
        }
    }

    var body: some View {
        NavigationStack {
            let filtered = filteredExpenses
            List {
                if !filtered.isEmpty {
                    Section {
                        HStack {
                            Text(filter.isActive ? "Total filtrado" : "Total registrado")
                            Spacer()
                            Text(Money.format(ExpenseSummary.total(of: filtered)))
                                .fontWeight(.semibold)
                                .monospacedDigit()
                        }
                        HStack {
                            Text("Gastos")
                            Spacer()
                            Text("\(filtered.count)").monospacedDigit()
                        }
                        .foregroundStyle(.secondary)
                    }
                }

                if filtered.isEmpty {
                    if filter.isActive {
                        ContentUnavailableView(
                            "Sin resultados",
                            systemImage: "line.3.horizontal.decrease.circle",
                            description: Text("Ningún gasto coincide con los filtros.")
                        )
                    } else {
                        ContentUnavailableView(
                            "Sin gastos",
                            systemImage: "tray",
                            description: Text("Los gastos que registres aparecerán aquí.")
                        )
                    }
                }

                ForEach(ExpenseSummary.groupedByDay(filtered, calendar: calendar)) { group in
                    Section {
                        ForEach(group.items) { expense in
                            Button { editingExpense = expense } label: {
                                ExpenseRow(expense: expense, showsDate: false)
                            }
                            .swipeActions {
                                Button { expenseToDelete = expense } label: {
                                    Label("Eliminar", systemImage: "trash")
                                }
                                .tint(.red)
                            }
                        }
                    } header: {
                        HStack {
                            Text(AppFormat.dayTitle(group.day, calendar: calendar))
                            Spacer()
                            Text(Money.format(ExpenseSummary.total(of: group.items)))
                                .monospacedDigit()
                        }
                    }
                }
            }
            .navigationTitle("Historial")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    ShareLink(
                        item: CSVFile(rows: filtered.map(\.csvRow)),
                        preview: SharePreview("Mis gastos (CSV)")
                    ) {
                        Label("Exportar CSV", systemImage: "square.and.arrow.up")
                    }
                    .disabled(filtered.isEmpty)
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { showingFilters = true } label: {
                        Label(
                            "Filtrar",
                            systemImage: filter.isActive
                                ? "line.3.horizontal.decrease.circle.fill"
                                : "line.3.horizontal.decrease.circle"
                        )
                    }
                    Button { showingNewExpense = true } label: {
                        Label("Añadir gasto", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingFilters) {
                HistoryFilterView(filter: $filter, categories: categories)
            }
            .sheet(isPresented: $showingNewExpense) {
                ExpenseFormView(mode: .new)
            }
            .sheet(item: $editingExpense) { expense in
                ExpenseFormView(mode: .edit(expense))
            }
            .deleteExpenseConfirmation(for: $expenseToDelete)
        }
    }
}

struct HistoryFilterView: View {
    @Binding var filter: ExpenseFilter<PersistentIdentifier>
    let categories: [ExpenseCategory]

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Categoría") {
                    Picker("Categoría", selection: $filter.category) {
                        Text("Todas").tag(PersistentIdentifier?.none)
                        ForEach(categories) { item in
                            Label(item.name, systemImage: item.symbol).tag(Optional(item.persistentModelID))
                        }
                    }
                }

                Section("Fecha") {
                    Toggle("Filtrar por fechas", isOn: $filter.filtersByDate)
                    if filter.filtersByDate {
                        DatePicker("Desde", selection: $filter.startDate, displayedComponents: .date)
                        DatePicker("Hasta", selection: $filter.endDate, displayedComponents: .date)
                    }
                }

                Section {
                    Button("Quitar filtros") {
                        filter.category = nil
                        filter.filtersByDate = false
                    }
                    .disabled(!filter.isActive)
                }
            }
            .navigationTitle("Filtros")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
