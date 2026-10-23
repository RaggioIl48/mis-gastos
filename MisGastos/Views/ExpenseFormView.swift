import SwiftData
import SwiftUI

/// Formulario para crear o editar un gasto.
struct ExpenseFormView: View {
    enum Mode {
        case new
        case edit(Expense)
    }

    let mode: Mode

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \ExpenseCategory.sortOrder) private var categories: [ExpenseCategory]
    @AppStorage("ultimaCategoria") private var lastCategoryName = ""

    @State private var amountText: String
    @State private var note: String
    @State private var date: Date
    @State private var category: ExpenseCategory?
    @State private var isSaving = false
    @State private var showingDuplicateAlert = false
    @State private var showingDeleteConfirmation = false
    @State private var errorMessage: String?
    @FocusState private var amountFocused: Bool

    init(mode: Mode) {
        self.mode = mode
        switch mode {
        case .new:
            _amountText = State(initialValue: "")
            _note = State(initialValue: "")
            _date = State(initialValue: .now)
            _category = State(initialValue: nil)
        case .edit(let expense):
            _amountText = State(initialValue: Money.thousandsInput(fromPesos: expense.amount))
            _note = State(initialValue: expense.note)
            _date = State(initialValue: expense.date)
            _category = State(initialValue: expense.category)
        }
    }

    private var isNew: Bool {
        if case .new = mode { return true }
        return false
    }

    private var parsedAmount: Result<Int, Money.ParseError> {
        Money.pesos(fromThousandsInput: amountText)
    }

    private var canSave: Bool {
        (try? parsedAmount.get()) != nil && category != nil && !isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                amountSection

                Section("Categoría") {
                    Picker("Categoría", selection: $category) {
                        Text("Selecciona una").tag(ExpenseCategory?.none)
                        ForEach(categories) { item in
                            Label(item.name, systemImage: item.symbol).tag(Optional(item))
                        }
                    }
                    .pickerStyle(.navigationLink)
                }

                Section("Detalles") {
                    DatePicker("Fecha", selection: $date, in: ...Date.now, displayedComponents: .date)
                    TextField("Descripción (opcional)", text: $note)
                        .submitLabel(.done)
                }

                if !isNew {
                    Section {
                        Button("Eliminar gasto", role: .destructive) {
                            showingDeleteConfirmation = true
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .navigationTitle(isNew ? "Nuevo gasto" : "Editar gasto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar", action: save)
                        .disabled(!canSave)
                }
            }
            .onAppear(perform: preselectCategory)
            .task {
                guard isNew else { return }
                // Espera a que termine la animación de la hoja para mostrar el teclado.
                try? await Task.sleep(for: .milliseconds(400))
                amountFocused = true
            }
            .alert("¿Gasto duplicado?", isPresented: $showingDuplicateAlert) {
                Button("Guardar de todos modos") { persist() }
                Button("Cancelar", role: .cancel) { isSaving = false }
            } message: {
                Text("Acabas de registrar un gasto con el mismo valor, categoría, fecha y descripción.")
            }
            .alert("No se pudo guardar", isPresented: Binding(isPresent: $errorMessage), presenting: errorMessage) { _ in
                Button("Aceptar", role: .cancel) {}
            } message: { message in
                Text(message)
            }
            .confirmationDialog("¿Eliminar este gasto?", isPresented: $showingDeleteConfirmation, titleVisibility: .visible) {
                Button("Eliminar", role: .destructive, action: deleteExpense)
            } message: {
                Text("Esta acción no se puede deshacer.")
            }
        }
    }

    private var amountSection: some View {
        Section {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("$")
                    .font(.title)
                    .foregroundStyle(.secondary)
                TextField("0", text: $amountText)
                    .keyboardType(.decimalPad)
                    .font(.system(size: 40, weight: .semibold, design: .rounded))
                    .focused($amountFocused)
                    .accessibilityLabel("Valor en miles de pesos")
                Text("mil")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            amountPreview
        } header: {
            Text("Valor")
        } footer: {
            Text("Escribe el valor en miles: 25 = $25.000 · 1250 = $1.250.000")
        }
    }

    @ViewBuilder
    private var amountPreview: some View {
        switch parsedAmount {
        case .success(let pesos):
            Label {
                Text("Se guardará como \(Money.format(pesos)) COP")
            } icon: {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.tint)
            }
        case .failure(.empty):
            Label("Vista previa: $0 COP", systemImage: "eye")
                .foregroundStyle(.secondary)
        case .failure(let error):
            Label(error.message, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
        }
    }

    private func preselectCategory() {
        guard isNew, category == nil else { return }
        category = categories.first { $0.name == lastCategoryName } ?? categories.first
    }

    private func save() {
        guard !isSaving, let pesos = try? parsedAmount.get(), let category else { return }
        isSaving = true
        if isNew && looksLikeDuplicate(pesos: pesos, category: category) {
            showingDuplicateAlert = true
            return
        }
        persist()
    }

    private func looksLikeDuplicate(pesos: Int, category: ExpenseCategory) -> Bool {
        let now = Date.now
        let since = now.addingTimeInterval(-DuplicateDetector.window)
        let descriptor = FetchDescriptor<Expense>(predicate: #Predicate<Expense> { $0.createdAt >= since })
        let recent = (try? modelContext.fetch(descriptor)) ?? []
        let candidate = DuplicateKey(amount: pesos, categoryName: category.name, date: date, note: note, createdAt: now)
        return DuplicateDetector.isLikelyDuplicate(candidate, among: recent.map(\.duplicateKey), calendar: .current)
    }

    private func persist() {
        guard let pesos = try? parsedAmount.get(), let category else {
            isSaving = false
            return
        }
        let cleanNote = note.trimmingCharacters(in: .whitespacesAndNewlines)

        switch mode {
        case .new:
            let expense = Expense(amount: pesos, note: cleanNote, date: date)
            modelContext.insert(expense)
            expense.category = category
        case .edit(let expense):
            expense.amount = pesos
            expense.note = cleanNote
            expense.date = date
            expense.category = category
        }

        do {
            try modelContext.save()
            lastCategoryName = category.name
            dismiss()
        } catch {
            isSaving = false
            errorMessage = "Inténtalo de nuevo."
        }
    }

    private func deleteExpense() {
        guard case .edit(let expense) = mode else { return }
        modelContext.delete(expense)
        try? modelContext.save()
        dismiss()
    }
}
