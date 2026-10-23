import SwiftData
import SwiftUI

struct CategoryIcon: View {
    let symbol: String

    var body: some View {
        Image(systemName: symbol)
            .font(.body)
            .foregroundStyle(.tint)
            .frame(width: 36, height: 36)
            .background(Color.accentColor.opacity(0.12), in: Circle())
            .accessibilityHidden(true)
    }
}

struct ExpenseRow: View {
    let expense: Expense
    var showsDate = true

    private var categoryName: String { expense.category?.name ?? ExpenseCategory.fallbackName }
    private var title: String { expense.note.isEmpty ? categoryName : expense.note }
    private var subtitle: String {
        var parts: [String] = []
        if !expense.note.isEmpty { parts.append(categoryName) }
        if showsDate { parts.append(AppFormat.shortDate(expense.date)) }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(spacing: 12) {
            CategoryIcon(symbol: expense.category?.symbol ?? ExpenseCategory.fallbackSymbol)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .lineLimit(1)
                if !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Text(Money.format(expense.amount))
                .fontWeight(.semibold)
                .monospacedDigit()
        }
        .foregroundStyle(.primary)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

struct MonthSelector: View {
    @Binding var month: Date
    var calendar: Calendar = .current

    private var isCurrentMonth: Bool {
        calendar.isDate(month, equalTo: .now, toGranularity: .month)
    }

    var body: some View {
        HStack {
            Button { shift(by: -1) } label: {
                Image(systemName: "chevron.left").frame(width: 44, height: 44)
            }
            .accessibilityLabel("Mes anterior")

            Spacer()

            Button {
                month = ExpenseSummary.startOfMonth(containing: .now, calendar: calendar)
            } label: {
                Text(AppFormat.monthTitle(month))
                    .font(.headline)
                    .foregroundStyle(.primary)
            }
            .accessibilityHint("Vuelve al mes actual")

            Spacer()

            Button { shift(by: 1) } label: {
                Image(systemName: "chevron.right").frame(width: 44, height: 44)
            }
            .disabled(isCurrentMonth)
            .accessibilityLabel("Mes siguiente")
        }
        .buttonStyle(.borderless)
    }

    private func shift(by value: Int) {
        month = ExpenseSummary.month(byAdding: value, to: month, calendar: calendar)
    }
}

struct AddExpenseButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("Añadir gasto", systemImage: "plus")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.bar)
    }
}

extension Binding where Value == Bool {
    /// `true` mientras `item` tenga valor; al cerrarse, lo vuelve `nil`.
    init<Wrapped>(isPresent item: Binding<Wrapped?>) {
        self.init(
            get: { item.wrappedValue != nil },
            set: { if !$0 { item.wrappedValue = nil } }
        )
    }
}

/// Pide confirmación antes de eliminar un gasto desde una lista.
struct DeleteExpenseConfirmation: ViewModifier {
    @Environment(\.modelContext) private var modelContext
    @Binding var expense: Expense?

    func body(content: Content) -> some View {
        content.confirmationDialog(
            "¿Eliminar este gasto?",
            isPresented: Binding(isPresent: $expense),
            titleVisibility: .visible,
            presenting: expense
        ) { item in
            Button("Eliminar \(Money.format(item.amount))", role: .destructive) {
                modelContext.delete(item)
                try? modelContext.save()
            }
        } message: { _ in
            Text("Esta acción no se puede deshacer.")
        }
    }
}

extension View {
    func deleteExpenseConfirmation(for expense: Binding<Expense?>) -> some View {
        modifier(DeleteExpenseConfirmation(expense: expense))
    }
}
