import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ScrollView,
  Modal,
  StatusBar,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { COLORS, SIZES, CATEGORY_LABELS } from '../constants/theme';
import { useCart } from '../context/CartContext';
import { useAlert } from '../context/AlertContext';
import { createOrder } from '../services/productService';

const CartScreen = ({ navigation }) => {
  const {
    items,
    subtotal,
    discountAmount,
    deliveryFee,
    total,
    itemCount,
    promoCode,
    discountPercent,
    increment,
    decrement,
    removeItem,
    clearCart,
    applyPromo,
    removePromo,
    markPromoAsUsed,
  } = useCart();
  const { showAlert } = useAlert();

  const [promoInput, setPromoInput] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [deliveryModalVisible, setDeliveryModalVisible] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [deliveryData, setDeliveryData] = useState({
    nombre: '',
    celular: '',
    direccion: '',
    barrio: '',
    detalles: '',
    gpsUrl: '',
  });
  const [orderData, setOrderData] = useState(null);
  const [whatsappConfirmVisible, setWhatsappConfirmVisible] = useState(false);
  const [tempOrderData, setTempOrderData] = useState(null);

  const formatPrice = (price) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(price);

  const handleGetLocation = async () => {
    setGpsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert(
          'Permiso Requerido',
          'Por favor concede el permiso de ubicación en tu celular para detectar automáticamente tu posición.'
        );
        setGpsLoading(false);
        return;
      }

      let location;
      try {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
      } catch (errHigh) {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      }

      const { latitude, longitude } = location.coords;
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      let addressText = '';

      try {
        let geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocode && geocode.length > 0) {
          const item = geocode[0];
          const parts = [
            item.street ? `${item.street} ${item.name && item.name !== item.street ? '#' + item.name : ''}` : item.name,
            item.subregion || item.district || item.city,
          ].filter(Boolean);
          addressText = parts.join(', ');
        }
      } catch (geoErr) {
        console.warn('Geocodificación inversa:', geoErr);
      }

      if (!addressText) {
        addressText = `Ubicación GPS (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
      }

      setDeliveryData((prev) => ({
        ...prev,
        direccion: addressText,
        gpsUrl: mapsUrl,
      }));

      showAlert(
        '¡Ubicación GPS Detectada!',
        `Se ha capturado tu ubicación exacta para el domiciliario.\n\n📍 Dirección: ${addressText}`
      );
    } catch (error) {
      console.warn('Error en handleGetLocation:', error);
      showAlert(
        'Error de Ubicación',
        'No se pudo obtener la ubicación GPS actual. Asegúrate de activar el GPS en tu celular.'
      );
    } finally {
      setGpsLoading(false);
    }
  };

  const handlePromo = () => {
    if (!promoInput.trim()) return;
    const result = applyPromo(promoInput);
    if (result.success) {
      showAlert('¡Descuento aplicado!', `Código ${result.originalCode} válido: ${result.discount}% de descuento.`);
      setPromoInput('');
    } else {
      if (result.reason === 'used') {
        showAlert('Código ya utilizado', 'Este código de descuento ya fue canjeado en una compra anterior.');
      } else {
        showAlert('Código inválido', 'El código ingresado no existe o expiró.');
      }
    }
  };

  const promptDeliveryForm = () => {
    if (items.length === 0) return;
    setDeliveryModalVisible(true);
  };

  const sendToWhatsApp = async (phone, message) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const encodedMsg = encodeURIComponent(message);
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
    const deepLink = `whatsapp://send?phone=${cleanPhone}&text=${encodedMsg}`;

    try {
      const canOpen = await Linking.canOpenURL(deepLink);
      if (canOpen) {
        await Linking.openURL(deepLink);
      } else {
        await Linking.openURL(waUrl);
      }
    } catch (err) {
      try {
        await Linking.openURL(waUrl);
      } catch (err2) {
        showAlert(
          'WhatsApp',
          `No se pudo abrir WhatsApp automáticamente. Puedes comunicarte directamente al número +${cleanPhone}.`
        );
      }
    }
  };

  const buildWhatsAppMessage = (orderId, itemsList, sub, discount, fee, tot, delivery) => {
    let msg = `🛍️ *NUEVO PEDIDO EN THIAGO'S LICORES & SNACKS*\n`;
    msg += `*Orden #${String(orderId).padStart(4, '0')}*\n\n`;
    msg += `📋 *Detalle del Pedido:*\n`;
    (itemsList || []).forEach(item => {
      msg += `• ${item.quantity}x ${item.name} (${formatPrice(item.price)})\n`;
    });
    msg += `\n💵 *Resumen:*`;
    msg += `\nSubtotal: ${formatPrice(sub)}`;
    if (discount > 0) msg += `\nDescuento: -${formatPrice(discount)}`;
    if (fee > 0) msg += `\nDomicilio: ${formatPrice(fee)}`;
    msg += `\n*TOTAL A PAGAR: ${formatPrice(tot)}*\n\n`;
    msg += `📍 *Datos de Entrega:*\n`;
    msg += `• Nombre: ${delivery?.nombre || 'Cliente'}\n`;
    msg += `• Teléfono: ${delivery?.celular || 'N/A'}\n`;
    msg += `• Dirección: ${delivery?.direccion || 'N/A'}\n`;
    msg += `• Barrio: ${delivery?.barrio || 'N/A'}\n`;
    if (delivery?.detalles) msg += `• Apto/Casa/Notas: ${delivery.detalles}\n`;

    // Enlace de Mapa Garantizado: Si se capturó GPS usa las coordenadas exactas, si no, genera la búsqueda de la dirección
    const mapLink = delivery?.gpsUrl
      ? delivery.gpsUrl
      : (delivery?.direccion
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.direccion + (delivery.barrio ? ', ' + delivery.barrio : ''))}`
          : null);

    if (mapLink) {
      msg += `\n🗺️ *Ubicación para Domiciliario (Google Maps / Waze):*\n${mapLink}\n`;
    }

    msg += `\n¡Quedo atento a la confirmación de mi pedido! Gracias.`;
    return msg;
  };

  const initiateWhatsAppFlow = async () => {
    try {
      const itemsSnapshot = [...items];
      const deliverySnapshot = { ...deliveryData };

      // Creamos un ID temporal para el mensaje de WhatsApp, para no impactar inventario falso
      const tempId = Math.floor(1000 + Math.random() * 9000); 

      const msg = buildWhatsAppMessage(
        "WEB-" + tempId,
        itemsSnapshot,
        subtotal,
        discountAmount,
        deliveryFee,
        total,
        deliverySnapshot
      );

      setTempOrderData({
        itemsSnapshot,
        deliverySnapshot,
        subtotal,
        discount_amount: discountAmount,
        delivery_fee: deliveryFee,
        total
      });

      const ADMIN_PHONE = "573114661605";
      
      // Ocultar formulario de domicilio antes de ir a WhatsApp
      setDeliveryModalVisible(false);
      
      // Abrir WhatsApp automáticamente
      await sendToWhatsApp(ADMIN_PHONE, msg);

      // Mostrar modal de verificación (esperando a que regresen de WhatsApp)
      setWhatsappConfirmVisible(true);

    } catch (e) {
      showAlert('Error', 'No se pudo abrir WhatsApp.');
    }
  };

  const finalizeOrder = async () => {
    setCheckoutLoading(true);
    try {
      // SOLO AHORA enviamos el pedido a la base de datos oficial
      const order = await createOrder({
        items: tempOrderData.itemsSnapshot,
        subtotal: tempOrderData.subtotal,
        discountAmount: tempOrderData.discount_amount,
        deliveryFee: tempOrderData.delivery_fee,
        total: tempOrderData.total,
        promoCode,
      });

      setOrderData({
        ...order,
        ...tempOrderData
      });

      if (promoCode) {
        await markPromoAsUsed(promoCode);
      }

      clearCart();
      removePromo();
      setWhatsappConfirmVisible(false);
      setReceiptVisible(true);

    } catch (e) {
      showAlert('Error al procesar', e.message || 'No se pudo guardar la orden en el inventario. Verifica tu conexión.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleCheckout = async () => {
    const nombre = deliveryData.nombre?.trim() || '';
    const celular = deliveryData.celular?.trim() || '';
    const direccion = deliveryData.direccion?.trim() || '';
    const barrio = deliveryData.barrio?.trim() || '';
    const detalles = deliveryData.detalles?.trim() || '';

    if (nombre.length < 3) {
      showAlert('Nombre inválido', 'Por favor ingresa tu nombre completo (mínimo 3 caracteres).');
      return;
    }
    
    const celularLimpio = celular.replace(/[^0-9]/g, '');
    if (celularLimpio.length < 10) {
      showAlert('Celular inválido', 'El número de celular debe tener al menos 10 dígitos.');
      return;
    }

    if (direccion.length < 5) {
      showAlert('Dirección inválida', 'Por favor ingresa una dirección completa.');
      return;
    }

    if (barrio.length < 3) {
      showAlert('Barrio inválido', 'El nombre del barrio es muy corto, por favor sé más específico.');
      return;
    }

    if (detalles.length < 2) {
      showAlert('Detalles incompletos', 'Indica el número de casa, apto, o información extra detallada (ej. "Casa 2", "Apto 101").');
      return;
    }

    // Validación inteligente de dirección colombiana si no se usó el GPS
    const regexNomenclatura = /^(calle|cl|carrera|cra|cr|transversal|tv|diagonal|dg|avenida|av|trans|kras|autopista|circular)\s*\d+/i;
    const direccionLimpia = deliveryData.direccion.trim();
    const esNomenclaturaValida = regexNomenclatura.test(direccionLimpia);

    if (!deliveryData.gpsUrl && !esNomenclaturaValida && direccionLimpia.length < 12) {
      showAlert(
        '📍 Confirmación de Ubicación',
        `La dirección escrita ("${direccionLimpia}") no parece contener una nomenclatura válida (Ej: Calle 45 # 12-34).\n\nPara evitar domicilios perdidos, debes capturar tu ubicación GPS o escribir una dirección con nomenclatura válida.`,
        [
          {
            text: '📍 Capturar mi GPS',
            onPress: handleGetLocation,
          },
          {
            text: 'Corregir Dirección',
            style: 'cancel',
          },
        ]
      );
      return;
    }

    await initiateWhatsAppFlow();
  };

  const handleCloseReceipt = () => {
    setReceiptVisible(false);
    setDeliveryData({ nombre: '', celular: '', direccion: '', barrio: '', detalles: '' });
    navigation.navigate('Tienda');
  };

  const renderItem = ({ item }) => (
    <View style={styles.cartItem}>
      <Image
        source={{ uri: item.image_url }}
        style={styles.cartItemImage}
        resizeMode="cover"
      />
      <View style={styles.cartItemDetails}>
        <Text style={styles.cartItemType}>{item.type}</Text>
        <Text style={styles.cartItemName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.cartItemPrice}>{formatPrice(item.price)}</Text>
      </View>
      <View style={styles.cartItemActions}>
        <View style={styles.qtyControl}>
          <TouchableOpacity style={styles.qtyBtn} onPress={() => decrement(item.id)}>
            <Ionicons name="remove" size={14} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.qtyValue}>{item.quantity}</Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => increment(item.id)}
            disabled={item.quantity >= item.stock}
          >
            <Ionicons
              name="add"
              size={14}
              color={item.quantity >= item.stock ? COLORS.textMuted : COLORS.textPrimary}
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.cartItemTotal}>{formatPrice(item.price * item.quantity)}</Text>
        <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeBtn}>
          <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bgPrimary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mi Carrito</Text>
        {items.length > 0 && (
          <TouchableOpacity
            onPress={() => showAlert('Vaciar carrito', '¿Deseas eliminar todos los artículos?', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Vaciar', style: 'destructive', onPress: clearCart },
            ])}
          >
            <Text style={styles.clearBtn}>Vaciar</Text>
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyCart}>
          <View style={styles.emptyCartIcon}>
            <Ionicons name="bag-outline" size={60} color={COLORS.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
          <Text style={styles.emptyDesc}>Agrega productos desde el catálogo para comenzar tu pedido.</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.navigate('Tienda', { screen: 'Home' })}
          >
            <LinearGradient colors={[COLORS.gold, COLORS.goldDark]} style={styles.emptyBtnGradient}>
              <Text style={styles.emptyBtnText}>Ver Catálogo</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={
              <View style={styles.summaryCard}>
                {/* Promo Code */}
                <Text style={styles.promoTitle}>Código de Descuento</Text>
                {promoCode ? (
                  <View style={styles.promoApplied}>
                    <Ionicons name="pricetag" size={16} color={COLORS.success} />
                    <Text style={styles.promoAppliedText}>{promoCode} — {discountPercent}% aplicado</Text>
                    <TouchableOpacity onPress={removePromo}>
                      <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.promoRow}>
                    <TextInput
                      style={styles.promoInput}
                      placeholder="Ej: THIAGO10"
                      placeholderTextColor={COLORS.textMuted}
                      value={promoInput}
                      onChangeText={setPromoInput}
                      autoCapitalize="characters"
                    />
                    <TouchableOpacity style={styles.promoBtn} onPress={handlePromo}>
                      <Text style={styles.promoBtnText}>Aplicar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Order Summary */}
                <View style={styles.orderSummary}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Subtotal ({itemCount} items)</Text>
                    <Text style={styles.summaryVal}>{formatPrice(subtotal)}</Text>
                  </View>
                  {discountAmount > 0 && (
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryKey, { color: COLORS.success }]}>Descuento</Text>
                      <Text style={[styles.summaryVal, { color: COLORS.success }]}>-{formatPrice(discountAmount)}</Text>
                    </View>
                  )}
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Domicilio</Text>
                    <Text style={styles.summaryVal}>{formatPrice(deliveryFee)}</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.totalKey}>TOTAL VENTA</Text>
                    <Text style={styles.totalVal}>{formatPrice(total)}</Text>
                  </View>
                </View>
              </View>
            }
          />

          {/* Checkout Button */}
          <View style={styles.checkoutBar}>
            <View style={styles.checkoutInfo}>
              <Text style={styles.checkoutLabel}>Total a pagar</Text>
              <Text style={styles.checkoutTotal}>{formatPrice(total)}</Text>
            </View>
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={promptDeliveryForm}
              disabled={checkoutLoading}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={[COLORS.gold, COLORS.goldDark]}
                style={styles.checkoutBtnGradient}
              >
                {checkoutLoading ? (
                  <Text style={styles.checkoutBtnText}>Cargando...</Text>
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.bgPrimary} />
                    <Text style={styles.checkoutBtnText}>Confirmar Pedido</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Delivery Form Modal */}
      <Modal visible={deliveryModalVisible} transparent animationType="slide">
        <View style={styles.receiptOverlay}>
          <View style={[styles.receiptModal, { padding: 0 }]}>
            <View style={{ padding: SIZES.lg, width: '100%' }}>
              <Text style={styles.receiptTitle}>Datos de Envío</Text>
              <Text style={[styles.receiptSubtitle, { marginBottom: SIZES.md }]}>
                Por favor, ingresa los datos para entregar tu pedido.
              </Text>
              
              <TextInput
                style={styles.inputField}
                placeholder="Nombre completo *"
                placeholderTextColor={COLORS.textMuted}
                value={deliveryData.nombre}
                onChangeText={(text) => setDeliveryData({ ...deliveryData, nombre: text })}
              />
              <TextInput
                style={styles.inputField}
                placeholder="Celular *"
                keyboardType="phone-pad"
                placeholderTextColor={COLORS.textMuted}
                value={deliveryData.celular}
                onChangeText={(text) => setDeliveryData({ ...deliveryData, celular: text })}
              />
              {/* GPS Location Button */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: deliveryData.gpsUrl ? COLORS.success + '22' : COLORS.goldSoft,
                  borderWidth: 1,
                  borderColor: deliveryData.gpsUrl ? COLORS.success : COLORS.gold,
                  borderRadius: SIZES.radiusSm,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  marginBottom: 12,
                  gap: 8,
                }}
                onPress={handleGetLocation}
                disabled={gpsLoading}
                activeOpacity={0.8}
              >
                {gpsLoading ? (
                  <ActivityIndicator color={COLORS.gold} size="small" />
                ) : (
                  <>
                    <Ionicons
                      name={deliveryData.gpsUrl ? "checkmark-circle" : "location"}
                      size={18}
                      color={deliveryData.gpsUrl ? COLORS.success : COLORS.gold}
                    />
                    <Text
                      style={{
                        color: deliveryData.gpsUrl ? COLORS.success : COLORS.gold,
                        fontWeight: '700',
                        fontSize: 13,
                      }}
                    >
                      {deliveryData.gpsUrl ? '📍 GPS Capturado (Toca para actualizar)' : '📍 Capturar mi Ubicación GPS'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TextInput
                style={styles.inputField}
                placeholder="Dirección completa *"
                placeholderTextColor={COLORS.textMuted}
                value={deliveryData.direccion}
                onChangeText={(text) => setDeliveryData({ ...deliveryData, direccion: text })}
              />
              <TextInput
                style={styles.inputField}
                placeholder="Barrio *"
                placeholderTextColor={COLORS.textMuted}
                value={deliveryData.barrio}
                onChangeText={(text) => setDeliveryData({ ...deliveryData, barrio: text })}
              />
              <TextInput
                style={styles.inputField}
                placeholder="Casa / Apto / Detalles *"
                placeholderTextColor={COLORS.textMuted}
                value={deliveryData.detalles}
                onChangeText={(text) => setDeliveryData({ ...deliveryData, detalles: text })}
              />
              
              <View style={{ marginTop: SIZES.lg, width: '100%', gap: 10 }}>
                <TouchableOpacity
                  style={{
                    width: '100%',
                    borderRadius: SIZES.radiusMd,
                    overflow: 'hidden',
                    shadowColor: '#25D366',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.35,
                    shadowRadius: 8,
                    elevation: 6,
                  }}
                  onPress={handleCheckout}
                  disabled={checkoutLoading}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#25D366', '#128C7E']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      paddingVertical: 16,
                      paddingHorizontal: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                    }}
                  >
                    {checkoutLoading ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="logo-whatsapp" size={22} color="#ffffff" style={{ marginRight: 8 }} />
                        <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16, letterSpacing: 0.3 }}>
                          Enviar Pedido por WhatsApp
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    width: '100%',
                    paddingVertical: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: SIZES.radiusMd,
                    backgroundColor: COLORS.bgTertiary,
                  }}
                  onPress={() => setDeliveryModalVisible(false)}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 }}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Receipt Modal */}
      <Modal
        visible={receiptVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
      >
        <View style={styles.receiptOverlay}>
          <View style={styles.receiptModal}>
            {/* Header */}
            <View style={styles.receiptHeader}>
              <View style={styles.receiptCheckIcon}>
                <Ionicons name="checkmark-circle" size={52} color={COLORS.success} />
              </View>
              <Text style={styles.receiptTitle}>¡Pedido Exitoso!</Text>
              <Text style={styles.receiptSubtitle}>
                Tu pedido fue registrado en el historial y enviado a WhatsApp para confirmación.
              </Text>
            </View>

            {/* Order Details */}
            <View style={styles.receiptDivider}>
              <View style={styles.receiptDividerLine} />
              <Text style={styles.receiptDividerText}>COMPROBANTE</Text>
              <View style={styles.receiptDividerLine} />
            </View>

            {orderData && (
              <View style={styles.receiptMeta}>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaKey}>Fecha</Text>
                  <Text style={styles.receiptMetaVal}>{new Date(orderData.created_at || Date.now()).toLocaleString('es-CO')}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaKey}>N° Pedido</Text>
                  <Text style={[styles.receiptMetaVal, { color: COLORS.gold }]}>#{orderData.id?.toString().padStart(4, '0') || 'N/A'}</Text>
                </View>

                <View style={{ marginTop: 10, marginBottom: 10 }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 6 }}>Productos:</Text>
                  {orderData.itemsSnapshot?.map((it, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: 13, flex: 1 }}>{it.quantity}x {it.name}</Text>
                      <Text style={{ color: COLORS.textPrimary, fontSize: 13 }}>{formatPrice(it.price * it.quantity)}</Text>
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: 13, flex: 1 }}>Domicilio</Text>
                    <Text style={{ color: COLORS.textPrimary, fontSize: 13 }}>{formatPrice(orderData.delivery_fee ?? deliveryFee)}</Text>
                  </View>
                </View>

                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptMetaKey}>Valor a pagar</Text>
                  <Text style={[styles.receiptMetaVal, { color: COLORS.success, fontWeight: '700', fontSize: 18 }]}>
                    {formatPrice(orderData.total)}
                  </Text>
                </View>
              </View>
            )}

            {/* Subtle Resend Link in case WhatsApp didn't launch automatically */}
            <TouchableOpacity
              style={{ paddingVertical: 8, marginBottom: 10, alignItems: 'center' }}
              onPress={() => {
                if (orderData) {
                  const ADMIN_PHONE = "573114661605";
                  const msg = buildWhatsAppMessage(
                    orderData.id,
                    orderData.itemsSnapshot || [],
                    orderData.subtotal || subtotal,
                    orderData.discount_amount || discountAmount,
                    orderData.delivery_fee ?? deliveryFee,
                    orderData.total,
                    orderData.deliverySnapshot || deliveryData
                  );
                  sendToWhatsApp(ADMIN_PHONE, msg);
                }
              }}
            >
              <Text style={{ color: '#25D366', fontSize: 13, textDecorationLine: 'underline', fontWeight: '600' }}>
                ¿No se abrió WhatsApp? Toca aquí para reintentar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.receiptCloseBtn} onPress={handleCloseReceipt}>
              <LinearGradient colors={[COLORS.gold, COLORS.goldDark]} style={styles.receiptCloseBtnGrad}>
                <Text style={styles.receiptCloseBtnText}>Entendido</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* WhatsApp Sent Verification Modal */}
      <Modal visible={whatsappConfirmVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.receiptCard, { maxWidth: '100%' }]}>
            <LinearGradient
              colors={[COLORS.bgTertiary, COLORS.bgSecondary]}
              style={{ width: '100%', padding: SIZES.lg, alignItems: 'center' }}
            >
              <Ionicons name="chatbubbles-outline" size={40} color={COLORS.gold} style={{ marginBottom: 10 }} />
              <Text style={[styles.receiptTitle, { textAlign: 'center' }]}>¿Enviaste el mensaje?</Text>
              
              <Text style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', marginTop: 10, lineHeight: 20 }}>
                Para registrar tu pedido oficialmente en nuestro sistema, necesitamos confirmar que enviaste la información por WhatsApp.
              </Text>

              <View style={{ width: '100%', marginTop: 25, gap: 12 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#25D366',
                    paddingVertical: 14,
                    width: '100%',
                    borderRadius: 12,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                  onPress={finalizeOrder}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? (
                    <ActivityIndicator color={COLORS.bgPrimary} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.bgPrimary} />
                      <Text style={{ color: COLORS.bgPrimary, fontWeight: 'bold', fontSize: 15 }}>Sí, acabo de enviarlo</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    backgroundColor: COLORS.bgTertiary,
                    borderWidth: 1,
                    borderColor: COLORS.danger,
                    paddingVertical: 14,
                    width: '100%',
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                  disabled={checkoutLoading}
                  onPress={() => {
                    setWhatsappConfirmVisible(false);
                  }}
                >
                  <Text style={{ color: COLORS.danger, fontWeight: 'bold', fontSize: 15 }}>No, cancelar pedido</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
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
  headerTitle: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  clearBtn: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCart: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SIZES.lg,
    gap: SIZES.sm,
  },
  emptyCartIcon: {
    width: 100,
    height: 100,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SIZES.sm,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  emptyDesc: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SIZES.sm,
  },
  emptyBtn: {
    borderRadius: SIZES.radiusFull,
    overflow: 'hidden',
    marginTop: SIZES.sm,
  },
  emptyBtnGradient: {
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  emptyBtnText: {
    color: COLORS.bgPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: SIZES.md,
    paddingTop: SIZES.sm,
    paddingBottom: SIZES.md,
  },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCard,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SIZES.sm,
    overflow: 'hidden',
  },
  cartItemImage: {
    width: 80,
    height: 90,
  },
  cartItemDetails: {
    flex: 1,
    padding: SIZES.sm,
    justifyContent: 'center',
  },
  cartItemType: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  cartItemName: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 4,
  },
  cartItemPrice: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  cartItemActions: {
    padding: SIZES.sm,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgTertiary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 6,
    minWidth: 24,
    textAlign: 'center',
  },
  cartItemTotal: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 6,
  },
  summaryCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SIZES.md,
    marginTop: SIZES.sm,
    gap: SIZES.sm,
  },
  promoTitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SIZES.xs,
  },
  promoRow: {
    flexDirection: 'row',
    gap: SIZES.sm,
  },
  promoInput: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusSm,
    paddingHorizontal: SIZES.sm + 4,
    paddingVertical: SIZES.sm,
    color: COLORS.textPrimary,
    fontSize: 14,
    height: 44,
  },
  inputField: {
    backgroundColor: COLORS.bgPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusSm,
    paddingHorizontal: SIZES.sm + 4,
    paddingVertical: SIZES.sm,
    color: COLORS.textPrimary,
    fontSize: 14,
    height: 44,
    marginBottom: SIZES.sm,
    width: '100%',
  },
  promoBtn: {
    backgroundColor: COLORS.goldSoft,
    borderRadius: SIZES.radiusSm,
    paddingHorizontal: SIZES.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold + '44',
    height: 44,
  },
  promoBtnText: {
    color: COLORS.gold,
    fontWeight: '700',
    fontSize: 13,
  },
  promoApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    backgroundColor: COLORS.successSoft,
    borderRadius: SIZES.radiusSm,
    padding: SIZES.sm + 4,
    borderWidth: 1,
    borderColor: COLORS.success + '33',
  },
  promoAppliedText: {
    flex: 1,
    color: COLORS.success,
    fontWeight: '600',
    fontSize: 13,
  },
  orderSummary: {
    gap: SIZES.sm,
    marginTop: SIZES.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryKey: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  summaryVal: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SIZES.xs,
  },
  totalKey: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalVal: {
    color: COLORS.gold,
    fontSize: 22,
    fontWeight: '700',
  },
  checkoutBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
    backgroundColor: COLORS.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SIZES.md,
  },
  checkoutInfo: {
    flex: 1,
  },
  checkoutLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  checkoutTotal: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  checkoutBtn: {
    borderRadius: SIZES.radiusFull,
    overflow: 'hidden',
  },
  checkoutBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  checkoutBtnText: {
    color: COLORS.bgPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  // Receipt Modal
  receiptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SIZES.md,
  },
  receiptModal: {
    backgroundColor: '#1a1a22',
    borderRadius: SIZES.radiusLg,
    padding: SIZES.lg,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  receiptCheckIcon: {
    marginBottom: SIZES.sm,
  },
  receiptTitle: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  receiptSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  receiptDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    marginVertical: SIZES.md,
    width: '100%',
  },
  receiptDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  receiptDividerText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  receiptMeta: {
    width: '100%',
    gap: SIZES.sm,
    marginBottom: SIZES.lg,
  },
  receiptMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  receiptMetaKey: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  receiptMetaVal: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  receiptCloseBtn: {
    borderRadius: SIZES.radiusFull,
    overflow: 'hidden',
    width: '100%',
  },
  receiptCloseBtnGrad: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  receiptCloseBtnText: {
    color: COLORS.bgPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
});

export default CartScreen;
