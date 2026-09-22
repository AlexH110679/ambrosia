// src/screens/AdminScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CustomAlertModal from '../components/CustomAlertModal';
import { COLORS, SIZES, CATEGORY_LABELS, CATEGORIES } from '../constants/theme';
import { useCart } from '../context/CartContext';
import {
  fetchProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  fetchQrUrl,
  updateQrUrlInDB,
  fetchCustomCategories,
  saveCustomCategory,
} from '../services/productService';

const CATEGORY_COLORS = {
  'cerveza-nacional': COLORS.gold,
  'cerveza-importada': COLORS.info,
  'licores': COLORS.purple,
  'snacks': COLORS.success,
};

const AdminScreen = ({ navigation }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Dynamic categories state
  const [allCategories, setAllCategories] = useState(CATEGORIES);
  
  // Promos State
  const [promosModalVisible, setPromosModalVisible] = useState(false);
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoPct, setNewPromoPct] = useState('');
  
  const { baseDeliveryCost, updateDeliveryCost, promosConfig, addPromoConfig, deletePromoConfig } = useCart();
  const [newCategoryModalVisible, setNewCategoryModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('pricetag');

  const CATEGORY_ICON_OPTIONS = [
    { icon: 'pricetag', label: 'Etiqueta' },
    { icon: 'wine', label: 'Vinos' },
    { icon: 'beer', label: 'Cerveza' },
    { icon: 'fast-food', label: 'Snacks' },
    { icon: 'flash', label: 'Energizante' },
    { icon: 'water', label: 'Bebida' },
    { icon: 'cafe', label: 'Café' },
    { icon: 'sparkles', label: 'Cóctel' },
    { icon: 'cube', label: 'Otro' },
  ];

  const loadCategories = useCallback(async () => {
    try {
      const custom = await fetchCustomCategories();
      if (custom && custom.length > 0) {
        const defaultIds = new Set(CATEGORIES.map(c => c.id));
        const filteredCustom = custom.filter(c => !defaultIds.has(c.id));
        setAllCategories([...CATEGORIES, ...filteredCustom]);
      } else {
        setAllCategories(CATEGORIES);
      }
    } catch (e) {
      console.warn('Error al cargar categorías personalizadas:', e);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleCreateCategory = async () => {
    if (!newCatName || !newCatName.trim()) {
      showAlert({
        title: 'Nombre Requerido',
        message: 'Por favor ingresa el nombre de la nueva categoría.',
        type: 'warning',
      });
      return;
    }
    const cleanName = newCatName.trim();
    const slug = cleanName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u06ff]/g, "")
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    if (!slug) {
      showAlert({
        title: 'Nombre Inválido',
        message: 'Por favor ingresa un nombre válido para la categoría.',
        type: 'warning',
      });
      return;
    }

    if (allCategories.some(c => c.id === slug)) {
      showAlert({
        title: 'Categoría Existente',
        message: `La categoría "${cleanName}" ya existe en el sistema.`,
        type: 'warning',
      });
      return;
    }

    const newCatObj = {
      id: slug,
      label: cleanName,
      icon: newCatIcon || 'pricetag',
      color: COLORS.gold,
      gradient: ['#e5b83b', '#c9971e'],
    };

    const updatedCustom = await saveCustomCategory(newCatObj);
    const defaultIds = new Set(CATEGORIES.map(c => c.id));
    const filteredCustom = updatedCustom.filter(c => !defaultIds.has(c.id));
    setAllCategories([...CATEGORIES, ...filteredCustom]);

    setFormCategory(slug);
    setNewCatName('');
    setNewCategoryModalVisible(false);

    showAlert({
      title: '¡Categoría Creada!',
      message: `La categoría "${cleanName}" fue creada y seleccionada para el producto.`,
      type: 'success',
    });
  };

  // Custom Styled Alert State
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    confirmText: 'Aceptar',
    cancelText: null,
    onConfirm: null,
    onCancel: null,
  });

  const showAlert = ({ title, message, type = 'info', confirmText = 'Aceptar', cancelText = null, onConfirm = null, onCancel = null }) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      confirmText,
      cancelText,
      onConfirm,
      onCancel,
    });
  };

  // Form & System state
  const defaultUrl = 'https://ambrosia-psi.vercel.app'; 
  const defaultWaUrl = 'https://wa.me/573114661605?text=Hola%20Thiago%27s%20Licores,%20quisiera%20hacer%20un%20pedido';
  const [storeUrl, setStoreUrl] = useState(defaultUrl);
  const [formName, setFormName] = useState('');
  const [configDelivery, setConfigDelivery] = useState(baseDeliveryCost?.toString() || '4000');

  useEffect(() => {
    const loadStoredQrUrl = async () => {
      try {
        const localUrl = await AsyncStorage.getItem('@store_qr_url');
        if (localUrl) {
          setStoreUrl(localUrl);
          return;
        }
        const dbUrl = await fetchQrUrl();
        if (dbUrl) {
          setStoreUrl(dbUrl);
          await AsyncStorage.setItem('@store_qr_url', dbUrl);
        }
      } catch (e) {
        console.warn('Error al cargar la URL del QR:', e);
      }
    };
    loadStoredQrUrl();
  }, []);

  const handleSaveQrUrl = async () => {
    const cleanUrl = (storeUrl || '').trim();
    if (!cleanUrl) {
      showAlert({
        title: 'Enlace Requerido',
        message: 'Por favor ingresa un enlace válido para generar el código QR.',
        type: 'warning',
      });
      return;
    }
    try {
      await AsyncStorage.setItem('@store_qr_url', cleanUrl);
      await updateQrUrlInDB(cleanUrl);
      showAlert({
        title: '¡Código QR Actualizado!',
        message: 'El código QR ha sido actualizado y guardado exitosamente.',
        type: 'success',
      });
    } catch (e) {
      showAlert({
        title: 'Error al Guardar',
        message: 'No se pudo guardar el enlace del código QR. Inténtalo de nuevo.',
        type: 'danger',
      });
    }
  };

  const handleTestQrLink = async () => {
    if (!storeUrl) return;
    try {
      const canOpen = await Linking.canOpenURL(storeUrl);
      if (canOpen) {
        await Linking.openURL(storeUrl);
      } else {
        showAlert({
          title: 'Enlace Inválido',
          message: 'No se puede abrir la URL especificada. Revisa que comience con http:// o https://',
          type: 'warning',
        });
      }
    } catch (e) {
      showAlert({
        title: 'Error',
        message: 'No se pudo abrir el enlace.',
        type: 'danger',
      });
    }
  };

  useEffect(() => {
    if (baseDeliveryCost !== undefined && baseDeliveryCost !== null) {
      setConfigDelivery(baseDeliveryCost.toString());
    }
  }, [baseDeliveryCost]);

  const handleSaveConfig = async () => {
    if (!configDelivery) {
      showAlert({
        title: 'Valor Requerido',
        message: 'Por favor ingresa el valor del domicilio.',
        type: 'warning',
      });
      return;
    }
    const cleaned = configDelivery.toString().replace(/[^0-9]/g, '');
    if (!cleaned) {
      showAlert({
        title: 'Valor Inválido',
        message: 'Por favor ingresa un monto numérico válido (ej: 4000).',
        type: 'warning',
      });
      return;
    }
    const success = await updateDeliveryCost(cleaned);
    if (success) {
      setConfigModalVisible(false);
      showAlert({
        title: '¡Tarifa Actualizada!',
        message: `El costo base del domicilio se guardó exitosamente en $ ${parseInt(cleaned, 10).toLocaleString('es-CO')}.`,
        type: 'success',
      });
    } else {
      showAlert({
        title: 'Error al Guardar',
        message: 'No se pudo guardar el valor del domicilio. Inténtalo de nuevo.',
        type: 'danger',
      });
    }
  };
  const [formCategory, setFormCategory] = useState('cerveza-nacional');
  const [formType, setFormType] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formImage, setFormImage] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formFeatured, setFormFeatured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert({
          title: 'Permiso Requerido',
          message: 'Se necesita acceso a la galería para seleccionar la foto del producto.',
          type: 'info',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setUploadingImage(true);
        const imageUrl = await uploadProductImage(asset.uri, asset.base64);
        setFormImage(imageUrl);
      }
    } catch (error) {
      showAlert({
        title: 'Error de Imagen',
        message: error.message || 'No se pudo cargar la imagen seleccionada.',
        type: 'danger',
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const loadProducts = useCallback(async () => {
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (e) {
      console.warn('Carga de productos local:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProducts();
  }, []);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategory('cerveza-nacional');
    setFormType('');
    setFormPrice('');
    setFormStock('');
    setFormImage('');
    setFormDesc('');
    setFormFeatured(false);
    setModalVisible(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setFormName(product.name);
    setFormCategory(product.category);
    setFormType(product.type);
    setFormPrice(String(product.price));
    setFormStock(String(product.stock));
    setFormImage(product.image_url || '');
    setFormDesc(product.description || '');
    setFormFeatured(product.featured || false);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formType.trim() || !formPrice || !formStock) {
      showAlert({
        title: 'Campos Requeridos',
        message: 'Por favor completa el nombre, tipo, precio y stock del producto.',
        type: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        category: formCategory,
        type: formType.trim(),
        price: parseInt(formPrice),
        stock: parseInt(formStock),
        image_url: formImage.trim() || null,
        description: formDesc.trim(),
        featured: formFeatured,
      };

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
      } else {
        await addProduct(payload);
      }

      setModalVisible(false);
      await loadProducts();
      showAlert({
        title: '¡Operación Exitosa!',
        message: editingProduct ? 'El producto ha sido actualizado correctamente.' : 'El producto ha sido agregado al catálogo.',
        type: 'success',
      });
    } catch (e) {
      showAlert({
        title: 'Error al Guardar',
        message: e.message || 'Ocurrió un inconveniente al intentar guardar.',
        type: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (product) => {
    showAlert({
      title: 'Eliminar Producto',
      message: `¿Estás seguro de que deseas eliminar "${product.name}"? Esta acción no se puede deshacer.`,
      type: 'danger',
      confirmText: 'Sí, Eliminar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        try {
          await deleteProduct(product.id);
          await loadProducts();
          showAlert({
            title: 'Producto Eliminado',
            message: `"${product.name}" ha sido removido del catálogo exitosamente.`,
            type: 'success',
          });
        } catch (e) {
          showAlert({
            title: 'Error al Eliminar',
            message: e.message || 'No se pudo eliminar el producto.',
            type: 'danger',
          });
        }
      },
    });
  };

  // Metrics
  const totalProducts = products.length;
  const totalBeers = products.filter(p => p.category.startsWith('cerveza')).length;
  const totalLiquors = products.filter(p => p.category === 'licores').length;
  const totalSnacks = products.filter(p => p.category === 'snacks').length;

  const metrics = [
    { label: 'Total', value: totalProducts, icon: 'cube', color: COLORS.gold, bg: COLORS.goldSoft },
    { label: 'Cervezas', value: totalBeers, icon: 'beer', color: COLORS.info, bg: COLORS.infoSoft },
    { label: 'Licores', value: totalLiquors, icon: 'wine', color: COLORS.purple, bg: COLORS.purpleSoft },
    { label: 'Snacks', value: totalSnacks, icon: 'fast-food', color: COLORS.success, bg: COLORS.successSoft },
  ];

  const renderItem = ({ item }) => {
    const catColor = CATEGORY_COLORS[item.category] || COLORS.gold;
    return (
      <View style={styles.productRow}>
        <Image source={{ uri: item.image_url }} style={styles.rowImage} resizeMode="cover" />
        <View style={styles.rowContent}>
          <View style={[styles.catBadge, { backgroundColor: catColor + '22' }]}>
            <Text style={[styles.catBadgeText, { color: catColor }]}>
              {allCategories.find(c => c.id === item.category)?.label || CATEGORY_LABELS[item.category] || item.category}
            </Text>
          </View>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.rowMeta}>
            <Text style={styles.rowPrice}>
              {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(item.price)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.rowStock, { color: item.stock <= 5 ? COLORS.danger : COLORS.success }]}>
                Stock: {item.stock}
              </Text>
              {item.stock <= 5 && (
                <View style={{ backgroundColor: COLORS.dangerSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ color: COLORS.danger, fontSize: 9, fontWeight: 'bold' }}>¡BAJO STOCK!</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <View style={styles.rowActions}>
          <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(item)}>
            <Ionicons name="create-outline" size={18} color={COLORS.gold} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View>
      <View style={styles.pageHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SIZES.sm }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ padding: 8, backgroundColor: COLORS.bgSecondary, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.pageTitle}>Panel de Control</Text>
            <Text style={styles.pageSubtitle}>Inventario de Thiago's</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={styles.addBtn} onPress={() => setSettingsMenuVisible(true)}>
            <View style={[styles.addBtnGrad, { backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="settings-outline" size={20} color={COLORS.gold} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Metrics */}
      <View style={styles.metricsGrid}>
        {metrics.map((m) => (
          <View key={m.label} style={[styles.metricCard, { backgroundColor: m.bg }]}>
            <View style={[styles.metricIcon, { backgroundColor: m.bg }]}>
              <Ionicons name={m.icon} size={22} color={m.color} />
            </View>
            <Text style={[styles.metricValue, { color: m.color }]}>{m.value}</Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.inventoryLabel}>Inventario ({totalProducts} productos)</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bgPrimary} />

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={50} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>Sin productos en el inventario.</Text>
              <TouchableOpacity style={styles.emptyAddBtn} onPress={openAddModal}>
                <Text style={styles.emptyAddText}>+ Agregar primer producto</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Product Form Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={false}
        statusBarTranslucent
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingProduct ? 'Editar Producto' : 'Nuevo Producto'}</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              <Text style={[styles.modalSaveText, saving && { opacity: 0.5 }]}>
                {saving ? 'Guardando...' : 'Guardar'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
            {/* Name */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Nombre del Producto *</Text>
              <TextInput
                style={styles.formInput}
                value={formName}
                onChangeText={setFormName}
                placeholder="Ej: Johnnie Walker Black Label"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Category Selector */}
            <View style={styles.formGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={styles.formLabel}>Módulo / Categoría *</Text>
                <TouchableOpacity onPress={() => setNewCategoryModalVisible(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="add-circle-outline" size={14} color={COLORS.gold} />
                  <Text style={{ color: COLORS.gold, fontSize: 12, fontWeight: '700' }}>+ Crear Categoría</Text>
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catSelector}>
                {allCategories.filter(c => c.id !== 'all').map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.catOption,
                      formCategory === cat.id && styles.catOptionActive,
                    ]}
                    onPress={() => setFormCategory(cat.id)}
                  >
                    <Ionicons name={cat.icon || 'pricetag'} size={16} color={formCategory === cat.id ? COLORS.bgPrimary : COLORS.textSecondary} />
                    <Text style={[
                      styles.catOptionText,
                      formCategory === cat.id && { color: COLORS.bgPrimary },
                    ]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={[
                    styles.catOption,
                    { backgroundColor: COLORS.goldSoft, borderColor: COLORS.gold, borderWidth: 1 }
                  ]}
                  onPress={() => setNewCategoryModalVisible(true)}
                >
                  <Ionicons name="add" size={16} color={COLORS.gold} />
                  <Text style={[styles.catOptionText, { color: COLORS.gold, fontWeight: '700' }]}>
                    + Otra Categoría
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* Type */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Tipo / Variedad *</Text>
              <TextInput
                style={styles.formInput}
                value={formType}
                onChangeText={setFormType}
                placeholder="Ej: Whisky Escocés 12 Años"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Price & Stock in row */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>Precio (COP) *</Text>
                <TextInput
                  style={styles.formInput}
                  value={formPrice}
                  onChangeText={setFormPrice}
                  placeholder="Ej: 165000"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: SIZES.sm }]}>
                <Text style={styles.formLabel}>Stock Inicial *</Text>
                <TextInput
                  style={styles.formInput}
                  value={formStock}
                  onChangeText={setFormStock}
                  placeholder="Ej: 24"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Image Picker */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Imagen del Producto</Text>
              
              {formImage ? (
                <View style={styles.imagePreviewWrapper}>
                  <Image source={{ uri: formImage }} style={styles.imagePreviewFull} resizeMode="cover" />
                  <View style={styles.imagePreviewOverlay}>
                    <TouchableOpacity
                      style={styles.changeImgBtn}
                      onPress={handlePickImage}
                      disabled={uploadingImage}
                    >
                      <Ionicons name="camera" size={16} color={COLORS.bgPrimary} />
                      <Text style={styles.changeImgText}>
                        {uploadingImage ? 'Cargando...' : 'Cambiar Foto'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeImgBtn}
                      onPress={() => setFormImage('')}
                      disabled={uploadingImage}
                    >
                      <Ionicons name="trash" size={16} color="#ffffff" />
                      <Text style={styles.removeImgText}>Quitar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.imagePickerCard}
                  onPress={handlePickImage}
                  disabled={uploadingImage}
                  activeOpacity={0.8}
                >
                  {uploadingImage ? (
                    <ActivityIndicator size="small" color={COLORS.gold} />
                  ) : (
                    <>
                      <View style={styles.imagePickerIconCircle}>
                        <Ionicons name="images" size={32} color={COLORS.gold} />
                      </View>
                      <Text style={styles.imagePickerTitle}>Elegir Foto de la Galería</Text>
                      <Text style={styles.imagePickerSubtitle}>
                        Toca aquí para seleccionar una imagen de tu dispositivo
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* Optional URL Toggle */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 5 }}
                onPress={() => setShowUrlInput(!showUrlInput)}
              >
                <Ionicons name={showUrlInput ? "chevron-up" : "link-outline"} size={14} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  {showUrlInput ? "Ocultar opción por URL" : "O ingresar URL pública manualmente"}
                </Text>
              </TouchableOpacity>

              {showUrlInput && (
                <TextInput
                  style={[styles.formInput, { marginTop: 8 }]}
                  value={formImage}
                  onChangeText={setFormImage}
                  placeholder="https://ejemplo.com/imagen.jpg"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              )}
            </View>

            {/* Description */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Descripción</Text>
              <TextInput
                style={[styles.formInput, styles.textArea]}
                value={formDesc}
                onChangeText={setFormDesc}
                placeholder="Descripción del producto, origen, características..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Featured Toggle */}
            <View style={styles.formGroup}>
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setFormFeatured(!formFeatured)}
              >
                <View>
                  <Text style={styles.formLabel}>¿Producto Destacado?</Text>
                  <Text style={styles.toggleHint}>Los destacados aparecen con una estrella dorada</Text>
                </View>
                <View style={[styles.toggle, formFeatured && styles.toggleActive]}>
                  {formFeatured && <Ionicons name="checkmark" size={14} color={COLORS.bgPrimary} />}
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Main Settings Menu Modal */}
      <Modal visible={settingsMenuVisible} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }} activeOpacity={1} onPress={() => setSettingsMenuVisible(false)}>
          <View style={{ backgroundColor: COLORS.bgSecondary, width: '100%', maxWidth: 300, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' }}>
            <View style={{ padding: 20, backgroundColor: COLORS.bgTertiary, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' }}>
              <Ionicons name="settings" size={32} color={COLORS.gold} />
              <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 8 }}>Ajustes del Sistema</Text>
            </View>

            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
              onPress={() => {
                setSettingsMenuVisible(false);
                setTimeout(() => openAddModal(), 300);
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: COLORS.success + '22', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                <Ionicons name="add-circle-outline" size={20} color={COLORS.success} />
              </View>
              <View>
                <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' }}>Crear Módulo / Producto</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>Añadir nuevo elemento al inventario</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
              onPress={() => {
                setSettingsMenuVisible(false);
                setTimeout(() => setQrModalVisible(true), 300);
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: COLORS.purple + '22', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                <Ionicons name="qr-code-outline" size={20} color={COLORS.purple} />
              </View>
              <View>
                <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' }}>Código QR</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>Generar QR para clientes</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
              onPress={() => {
                setSettingsMenuVisible(false);
                setConfigDelivery(baseDeliveryCost?.toString() || '4000');
                setTimeout(() => setConfigModalVisible(true), 300); // Wait for menu to close before opening next modal
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: COLORS.gold + '22', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                <Ionicons name="cash-outline" size={20} color={COLORS.gold} />
              </View>
              <View>
                <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' }}>Costo Domicilio</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>Editar tarifa de envío</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
              onPress={() => {
                setSettingsMenuVisible(false);
                setTimeout(() => setPromosModalVisible(true), 300);
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: COLORS.success + '22', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                <Ionicons name="ticket-outline" size={20} color={COLORS.success} />
              </View>
              <View>
                <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' }}>Códigos de Descuento</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>Crear y eliminar promociones</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}
              onPress={() => {
                setSettingsMenuVisible(false);
                navigation.navigate('AdminOrders');
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: COLORS.info + '22', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                <Ionicons name="receipt-outline" size={20} color={COLORS.info} />
              </View>
              <View>
                <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' }}>Historial de Pedidos</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>Ver todos los pedidos</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={{ padding: 16, alignItems: 'center', backgroundColor: COLORS.bgTertiary, borderTopWidth: 1, borderTopColor: COLORS.border }} onPress={() => setSettingsMenuVisible(false)}>
              <Text style={{ color: COLORS.textMuted, fontWeight: '700' }}>Cerrar Menu</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Config Delivery Modal */}
      <Modal visible={configModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a1a22', width: '100%', maxWidth: 320, padding: 24, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }}>
            <Ionicons name="cash-outline" size={40} color={COLORS.gold} style={{ marginBottom: 15 }} />
            <Text style={{ color: COLORS.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 10, textAlign: 'center' }}>Costo de Domicilio</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
              Define el valor base del envío que se sumará a los pedidos de los clientes.
            </Text>
            <TextInput
              style={{ width: '100%', backgroundColor: COLORS.bgTertiary, color: COLORS.gold, fontSize: 24, fontWeight: '700', textAlign: 'center', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 20 }}
              value={configDelivery}
              onChangeText={setConfigDelivery}
              keyboardType="numeric"
              placeholder="Ej: 4000"
              placeholderTextColor={COLORS.textMuted}
            />
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity style={{ flex: 1, padding: 15, borderRadius: 10, backgroundColor: COLORS.bgTertiary, alignItems: 'center' }} onPress={() => setConfigModalVisible(false)}>
                <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, padding: 15, borderRadius: 10, backgroundColor: COLORS.gold, alignItems: 'center' }} onPress={handleSaveConfig}>
                <Text style={{ color: COLORS.bgPrimary, fontWeight: '700' }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Promos Modal */}
      <Modal visible={promosModalVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a1a22', width: '100%', maxWidth: 350, padding: 24, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, maxHeight: '80%' }}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: 'bold' }}>Promociones Activas</Text>
              <TouchableOpacity onPress={() => setPromosModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 200, marginBottom: 20 }}>
              {Object.keys(promosConfig || {}).map(code => (
                <View key={code} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.bgTertiary, padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border }}>
                  <View>
                    <Text style={{ color: COLORS.gold, fontWeight: 'bold', fontSize: 16 }}>{code}</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>Descuento: {promosConfig[code]}%</Text>
                  </View>
                  <TouchableOpacity 
                    style={{ backgroundColor: COLORS.dangerSoft, padding: 8, borderRadius: 8 }}
                    onPress={async () => {
                      await deletePromoConfig(code);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              {(!promosConfig || Object.keys(promosConfig).length === 0) && (
                <Text style={{ color: COLORS.textMuted, textAlign: 'center', marginTop: 10 }}>No hay códigos de descuento creados.</Text>
              )}
            </ScrollView>

            <Text style={{ color: COLORS.textPrimary, fontWeight: '600', marginBottom: 8 }}>Crear Nuevo Código</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: COLORS.bgTertiary, color: COLORS.textPrimary, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.border, fontSize: 14 }}
                placeholder="CÓDIGO (Ej: VIP20)"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="characters"
                value={newPromoCode}
                onChangeText={setNewPromoCode}
              />
              <TextInput
                style={{ width: 80, backgroundColor: COLORS.bgTertiary, color: COLORS.textPrimary, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.border, fontSize: 14, textAlign: 'center' }}
                placeholder="% Dcto"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="numeric"
                value={newPromoPct}
                onChangeText={setNewPromoPct}
              />
            </View>

            <TouchableOpacity
              style={{ backgroundColor: COLORS.gold, paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
              onPress={async () => {
                if(!newPromoCode.trim() || !newPromoPct.trim()) {
                  alert("Ingresa un código y su porcentaje."); return;
                }
                const success = await addPromoConfig(newPromoCode, newPromoPct);
                if(success) {
                  setNewPromoCode('');
                  setNewPromoPct('');
                } else {
                  alert("Hubo un error al guardar o el porcentaje es inválido.");
                }
              }}
            >
              <Text style={{ color: COLORS.bgPrimary, fontWeight: 'bold' }}>Agregar Promoción</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* New Category Modal */}
      <Modal visible={newCategoryModalVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a1a22', width: '100%', maxWidth: 360, padding: 24, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.goldSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="folder-open" size={24} color={COLORS.gold} />
            </View>

            <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 4 }}>Crear Nueva Categoría</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginBottom: 20 }}>
              Amplía los módulos de productos para que tus clientes puedan explorar nuevas categorías.
            </Text>

            {/* Input Name */}
            <Text style={{ color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', alignSelf: 'flex-start', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Nombre de la Categoría *
            </Text>
            <TextInput
              style={{ width: '100%', backgroundColor: COLORS.bgTertiary, color: COLORS.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }}
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder="Ej: Vinos, Cigarrillos, Energizantes..."
              placeholderTextColor={COLORS.textMuted}
            />

            {/* Icon Selector */}
            <Text style={{ color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', alignSelf: 'flex-start', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Ícono del Módulo:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
              {CATEGORY_ICON_OPTIONS.map((item) => {
                const isSelected = newCatIcon === item.icon;
                return (
                  <TouchableOpacity
                    key={item.icon}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: isSelected ? COLORS.gold : COLORS.bgTertiary,
                      borderWidth: 1,
                      borderColor: isSelected ? COLORS.gold : COLORS.border,
                    }}
                    onPress={() => setNewCatIcon(item.icon)}
                  >
                    <Ionicons name={item.icon} size={16} color={isSelected ? COLORS.bgPrimary : COLORS.textSecondary} />
                    <Text style={{ color: isSelected ? COLORS.bgPrimary : COLORS.textSecondary, fontSize: 12, fontWeight: '600' }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.bgTertiary, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}
                onPress={() => { setNewCategoryModalVisible(false); setNewCatName(''); }}
              >
                <Text style={{ color: COLORS.textMuted, fontWeight: '600', fontSize: 14 }}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' }}
                onPress={handleCreateCategory}
              >
                <Text style={{ color: COLORS.bgPrimary, fontWeight: '700', fontSize: 14 }}>Crear Categoría</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* QR Code Modal */}
      <Modal visible={qrModalVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a1a22', width: '100%', maxWidth: 360, padding: 24, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.purple + '22', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="qr-code" size={26} color={COLORS.purple} />
            </View>

            <Text style={{ color: COLORS.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 4 }}>Código QR de la Tienda</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
              Genera y guarda el QR oficial para que tus clientes puedan pedir directamente desde su móvil.
            </Text>

            {/* QR Render */}
            <View style={{ padding: 16, backgroundColor: '#ffffff', borderRadius: 16, marginBottom: 16, alignItems: 'center', justifyContent: 'center' }}>
              <QRCode
                value={storeUrl?.trim() || defaultUrl}
                size={180}
                color="#000000"
                backgroundColor="#ffffff"
              />
            </View>



            <TouchableOpacity
              style={{ width: '100%', paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.bgTertiary, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}
              onPress={() => setQrModalVisible(false)}
            >
              <Text style={{ color: COLORS.textMuted, fontWeight: '600', fontSize: 14 }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Custom Styled Alert Modal */}
      <CustomAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.xxl,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SIZES.md,
  },
  pageTitle: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  pageSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  addBtn: {
    borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
  },
  addBtnGrad: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SIZES.radiusMd,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: SIZES.sm,
    marginBottom: SIZES.md,
  },
  metricCard: {
    flex: 1,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.sm + 4,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricIcon: {
    width: 36,
    height: 36,
    borderRadius: SIZES.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  metricLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  inventoryLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SIZES.sm,
    paddingTop: SIZES.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  productRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCard,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SIZES.sm,
    overflow: 'hidden',
    alignItems: 'center',
  },
  rowImage: {
    width: 72,
    height: 72,
    backgroundColor: COLORS.bgTertiary,
  },
  rowContent: {
    flex: 1,
    padding: SIZES.sm,
    gap: 3,
  },
  catBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
  },
  catBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  rowName: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  rowMeta: {
    flexDirection: 'row',
    gap: SIZES.sm,
    alignItems: 'center',
  },
  rowPrice: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '700',
  },
  rowStock: {
    fontSize: 11,
    fontWeight: '500',
  },
  rowActions: {
    paddingRight: SIZES.sm,
    gap: SIZES.sm,
    alignItems: 'center',
  },
  editBtn: {
    width: 34,
    height: 34,
    backgroundColor: COLORS.goldSoft,
    borderRadius: SIZES.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold + '33',
  },
  deleteBtn: {
    width: 34,
    height: 34,
    backgroundColor: COLORS.dangerSoft,
    borderRadius: SIZES.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.danger + '33',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SIZES.xxl,
    gap: SIZES.sm,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  emptyAddBtn: {
    marginTop: SIZES.sm,
    paddingHorizontal: SIZES.lg,
    paddingVertical: SIZES.sm,
    backgroundColor: COLORS.goldSoft,
    borderRadius: SIZES.radiusFull,
  },
  emptyAddText: {
    color: COLORS.gold,
    fontWeight: '700',
    fontSize: 14,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SIZES.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  modalSaveText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '700',
  },
  formContent: {
    padding: SIZES.md,
    gap: SIZES.xs,
  },
  formGroup: {
    marginBottom: SIZES.md,
  },
  formLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: SIZES.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  formInput: {
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusSm,
    paddingHorizontal: SIZES.sm + 4,
    paddingVertical: SIZES.sm + 4,
    color: COLORS.textPrimary,
    fontSize: 15,
    height: 48,
  },
  textArea: {
    height: 100,
    paddingTop: SIZES.sm,
  },
  formRow: {
    flexDirection: 'row',
    marginBottom: SIZES.md,
  },
  catSelector: {
    gap: SIZES.sm,
    paddingVertical: SIZES.xs,
  },
  catOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SIZES.sm + 4,
    paddingVertical: 9,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: SIZES.radiusFull,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catOptionActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  catOptionText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  imagePickerCard: {
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 130,
  },
  imagePickerIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  imagePickerSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  imagePreviewWrapper: {
    position: 'relative',
    borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 180,
  },
  imagePreviewFull: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.bgTertiary,
  },
  imagePreviewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    alignItems: 'center',
  },
  changeImgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  changeImgText: {
    color: COLORS.bgPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  removeImgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.danger,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  removeImgText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  imagePreview: {
    width: '100%',
    height: 140,
    borderRadius: SIZES.radiusMd,
    marginTop: SIZES.sm,
    backgroundColor: COLORS.bgTertiary,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.sm + 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleHint: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  toggle: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: COLORS.bgTertiary,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
});

export default AdminScreen;
