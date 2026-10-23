import SwiftData
import SwiftUI

struct CategoriesView: View {
    private enum EditorTarget: Identifiable {
        case new
        case edit(ExpenseCategory)

        var id: AnyHashable {
            switch self {
            case .new: return AnyHashable("nueva")
            case .edit(let category): return AnyHashable(category.persistentModelID)
            }
        }
    }

    @Environment(\.modelContext) private var modelContext
    @Query(sort: \ExpenseCategory.sortOrder) private var categories: [ExpenseCategory]

    @State private var editorTarget: EditorTarget?
    @State private var pendingDeletion: ExpenseCategory?
    @State private var blockedDeletion: ExpenseCategory?

    var body: some View {
        NavigationStack {
            List {
                if categories.isEmpty {
                    ContentUnavailableView(
                        "Sin categorías",
                        systemImage: "square.grid.2x2",
                        description: Text("Crea una categoría para empezar a registrar gastos.")
                    )
                }
                Section {
                    ForEach(categories) { category in
                        Button { editorTarget = .edit(category) } label: {
                            HStack(spacing: 12) {
                                CategoryIcon(symbol: category.symbol)
                                Text(category.name)
                                    .foregroundStyle(.primary)
                                Spacer()
                                Text(CategoryRules.usageText(category.expenses.count))
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .swipeActions {
                            Button { requestDeletion(of: category) } label: {
                                Label("Eliminar", systemImage: "trash")
                            }
                            .tint(.red)
                        }
                    }
                } footer: {
                    if !categories.isEmpty {
                        Text("Toca una categoría para cambiar su nombre o icono. Solo se pueden eliminar las que no tienen gastos; las demás se conservan en el historial.")
                    }
                }
            }
            .navigationTitle("Categorías")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { editorTarget = .new } label: {
                        Label("Nueva categoría", systemImage: "plus")
                    }
                }
            }
            .sheet(item: $editorTarget) { target in
                switch target {
                case .new:
                    CategoryEditorView(category: nil)
                case .edit(let category):
                    CategoryEditorView(category: category)
                }
            }
            .confirmationDialog(
                "¿Eliminar la categoría?",
                isPresented: Binding(isPresent: $pendingDeletion),
                titleVisibility: .visible,
                presenting: pendingDeletion
            ) { category in
                Button("Eliminar \(category.name)", role: .destructive) {
                    modelContext.delete(category)
                    try? modelContext.save()
                }
            }
            .alert(
                "No se puede eliminar",
                isPresented: Binding(isPresent: $blockedDeletion),
                presenting: blockedDeletion
            ) { _ in
                Button("Aceptar", role: .cancel) {}
            } message: { category in
                Text("“\(category.name)” se usa en \(CategoryRules.usageText(category.expenses.count)). Se conserva para no alterar tu historial, pero puedes cambiarle el nombre.")
            }
        }
    }

    private func requestDeletion(of category: ExpenseCategory) {
        if CategoryRules.canDelete(expenseCount: category.expenses.count) {
            pendingDeletion = category
        } else {
            blockedDeletion = category
        }
    }
}

struct CategoryEditorView: View {
    /// `nil` para crear una categoría nueva.
    let category: ExpenseCategory?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \ExpenseCategory.sortOrder) private var categories: [ExpenseCategory]

    @State private var name: String
    @State private var symbol: String
    @State private var errorMessage: String?

    init(category: ExpenseCategory?) {
        self.category = category
        _name = State(initialValue: category?.name ?? "")
        _symbol = State(initialValue: category?.symbol ?? ExpenseCategory.newCategorySymbol)
    }

    private var validationError: String? {
        let otherNames = categories
            .filter { $0.persistentModelID != category?.persistentModelID }
            .map(\.name)
        return CategoryRules.validationError(for: name, existingNames: otherNames)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nombre", text: $name)
                } footer: {
                    if !name.isEmpty, let validationError {
                        Text(validationError).foregroundStyle(.red)
                    }
                }

                Section("Icono") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 44), spacing: 8)], spacing: 8) {
                        ForEach(ExpenseCategory.availableSymbols, id: \.self) { item in
                            Button { symbol = item } label: {
                                Image(systemName: item)
                                    .font(.title3)
                                    .frame(width: 44, height: 44)
                                    .foregroundStyle(symbol == item ? Color.accentColor : Color.secondary)
                                    .background(
                                        symbol == item ? Color.accentColor.opacity(0.18) : Color.clear,
                                        in: RoundedRectangle(cornerRadius: 10)
                                    )
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(symbol == item ? .isSelected : [])
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle(category == nil ? "Nueva categoría" : "Editar categoría")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar", action: save)
                        .disabled(validationError != nil)
                }
            }
            .alert("No se pudo guardar", isPresented: Binding(isPresent: $errorMessage), presenting: errorMessage) { _ in
                Button("Aceptar", role: .cancel) {}
            } message: { message in
                Text(message)
            }
        }
    }

    private func save() {
        guard validationError == nil else { return }
        let cleanName = CategoryRules.normalizedName(name)

        if let category {
            category.name = cleanName
            category.symbol = symbol
        } else {
            let nextOrder = (categories.map(\.sortOrder).max() ?? -1) + 1
            modelContext.insert(ExpenseCategory(name: cleanName, symbol: symbol, sortOrder: nextOrder))
        }

        do {
            try modelContext.save()
            dismiss()
        } catch {
            errorMessage = "Inténtalo de nuevo."
        }
    }
}
