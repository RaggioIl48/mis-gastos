import SwiftData
import SwiftUI

struct HomeView: View {
    @Query(sort: [
        SortDescriptor(\Expense.date, order: .reverse),
        SortDescriptor(\Expense.createdAt, order: .reverse),
    ])
    private var expenses: [Expense]

    @State private var selectedMonth = ExpenseSummary.startOfMonth(containing: .now, calendar: .current)
    @State private var showingNewExpense = false
    @State private var editingExpense: Expense?
    @State private var expenseToDelete: Expense?

    private let calendar = Calendar.current

    private var isCurrentMonth: Bool {
        calendar.isDate(selectedMonth, equalTo: .now, toGranularity: .month)
    }

    private var monthExpenses: [Expense] {
        expenses.filter { calendar.isDate($0.date, equalTo: selectedMonth, toGranularity: .month) }
    }

    var body: some View {
        NavigationStack {
            let monthItems = monthExpenses
            List {
                Section {
                    MonthSelector(month: $selectedMonth, calendar: calendar)
                    summary(for: monthItems)
                }

                Section {
                    if monthItems.isEmpty {
                        ContentUnavailableView(
                            "Sin gastos",
                            systemImage: "tray",
                            description: Text(isCurrentMonth
                                ? "Aún no has registrado gastos este mes."
                                : "No hay gastos registrados en este mes.")
                        )
                    } else {
                        ForEach(monthItems) { expense in
                            Button { editingExpense = expense } label: {
                                ExpenseRow(expense: expense)
                            }
                            .swipeActions {
                                Button { expenseToDelete = expense } label: {
                                    Label("Eliminar", systemImage: "trash")
                                }
                                .tint(.red)
                            }
                        }
                    }
                } header: {
                    Text(isCurrentMonth ? "Últimos movimientos" : "Movimientos del mes")
                }
            }
            .navigationTitle("Mis Gastos")
            .safeAreaInset(edge: .bottom) {
                AddExpenseButton { showingNewExpense = true }
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

    private func summary(for monthItems: [Expense]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Total del mes")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(Money.format(ExpenseSummary.total(of: monthItems)))
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }

            Divider()

            HStack {
                Label("Hoy", systemImage: "sun.max")
                    .foregroundStyle(.secondary)
                Spacer()
                Text(Money.format(ExpenseSummary.total(of: expenses, onDayOf: .now, calendar: calendar)))
                    .fontWeight(.semibold)
                    .monospacedDigit()
            }

            HStack {
                Label("Movimientos del mes", systemImage: "list.bullet")
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(monthItems.count)")
                    .fontWeight(.semibold)
                    .monospacedDigit()
            }
        }
        .padding(.vertical, 8)
    }
}
